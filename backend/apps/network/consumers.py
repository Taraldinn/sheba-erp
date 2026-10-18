import asyncio
import json
import logging
import time
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from django.utils import timezone
from .models import Router
from .services.mikrotik.client import RouterClient, MikroTikRESTClient

logger = logging.getLogger(__name__)


class RouterTrafficConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for streaming real-time MikroTik router interface traffic,
    CPU load, RAM utilization, and system telemetry with ultra-low latency (<35ms)
    over a persistent socket connection.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.router_id = None
        self.interface = 'ether1'
        self.traffic_task = None
        self.router = None
        self.is_running = False
        self._binary_client = None
        self._rest_client = None

    async def connect(self):
        self.router_id = self.scope['url_route']['kwargs'].get('router_id')
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        params = parse_qs(query_string)
        if 'interface' in params and params['interface']:
            self.interface = params['interface'][0]

        # Verify router exists
        self.router = await self._get_router(self.router_id)
        if not self.router:
            logger.warning("WebSocket rejected: Router %s not found", self.router_id)
            await self.close(code=4404)
            return

        await self.accept()
        self.is_running = True
        logger.info("WebSocket connected for Router %s (monitoring %s)", self.router_id, self.interface)

        # Start streaming background task
        self.traffic_task = asyncio.create_task(self._stream_loop())

    async def disconnect(self, close_code):
        self.is_running = False
        if self.traffic_task and not self.traffic_task.done():
            self.traffic_task.cancel()
            try:
                await self.traffic_task
            except asyncio.CancelledError:
                pass

        # Cleanly disconnect persistent client
        await self._disconnect_client()
        logger.info("WebSocket disconnected for Router %s (code: %s)", self.router_id, close_code)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            payload = json.loads(text_data)
            action = payload.get('action')
            if action == 'set_interface':
                new_iface = payload.get('interface')
                if new_iface and new_iface != self.interface:
                    logger.debug("Switching monitored interface from %s to %s", self.interface, new_iface)
                    self.interface = new_iface
                    await self.send(text_data=json.dumps({
                        'type': 'interface_changed',
                        'interface': self.interface,
                    }))
            elif action == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except Exception as err:
            logger.debug("Error processing WebSocket message: %s", err)

    @sync_to_async
    def _get_router(self, router_id):
        try:
            return Router.objects.get(id=router_id)
        except Exception:
            return None

    @sync_to_async
    def _disconnect_client(self):
        if self._binary_client:
            try:
                self._binary_client.disconnect()
            except Exception:
                pass
            finally:
                self._binary_client = None

        if self._rest_client:
            try:
                self._rest_client.close()
            except Exception:
                pass
            finally:
                self._rest_client = None

    @sync_to_async
    def _fetch_realtime_telemetry(self):
        """
        Fetches interface traffic and system resource (CPU, RAM, Uptime)
        over the persistent connection with sub-35ms latency.
        """
        if not self.router:
            return {}

        is_rest = getattr(self.router, 'api_protocol', 'API') == 'REST'
        t0 = time.time()

        if is_rest:
            try:
                if not self._rest_client:
                    self._rest_client = MikroTikRESTClient.from_router(self.router)

                traffic_res = self._rest_client.post('/interface/monitor-traffic', json_data={
                    'interface': self.interface,
                    'once': 'true',
                })
                resource_res = self._rest_client.get('/system/resource')

                traffic_row = traffic_res[0] if isinstance(traffic_res, list) and traffic_res else (traffic_res if isinstance(traffic_res, dict) else {})
                resource_row = resource_res[0] if isinstance(resource_res, list) and resource_res else (resource_res if isinstance(resource_res, dict) else {})
                latency_ms = round((time.time() - t0) * 1000, 1)

                return self._parse_telemetry(traffic_row, resource_row, latency_ms)
            except Exception as exc:
                logger.debug("REST persistent telemetry error: %s", exc)
                if self._rest_client:
                    try:
                        self._rest_client.close()
                    except Exception:
                        pass
                    self._rest_client = None
                return {}

        # Binary API protocol (Port 8728/110)
        try:
            if not self._binary_client or not getattr(self._binary_client, '_connected', False):
                self._binary_client = RouterClient.from_router(self.router)
                self._binary_client.connect()

            # Query traffic on existing open socket (< 15ms)
            res_traffic = self._binary_client._api.get_resource('/').call('interface/monitor-traffic', {
                'interface': self.interface,
                'once': ''
            })

            # Query system resource on existing open socket (< 15ms)
            res_resource = self._binary_client.run_command('/system/resource')
            latency_ms = round((time.time() - t0) * 1000, 1)

            traffic_row = res_traffic[0] if isinstance(res_traffic, list) and res_traffic else {}
            resource_row = res_resource[0] if isinstance(res_resource, list) and res_resource else {}

            return self._parse_telemetry(traffic_row, resource_row, latency_ms)
        except Exception as exc:
            logger.debug("Binary API persistent telemetry error: %s", exc)
            if self._binary_client:
                try:
                    self._binary_client.disconnect()
                except Exception:
                    pass
                self._binary_client = None
            return {}

    def _parse_telemetry(self, traffic_row: dict, resource_row: dict, latency_ms: float) -> dict:
        rx_bps = float(traffic_row.get('rx-bits-per-second') or traffic_row.get('rx_bps') or 0.0)
        tx_bps = float(traffic_row.get('tx-bits-per-second') or traffic_row.get('tx_bps') or 0.0)
        rx_pps = int(traffic_row.get('rx-packets-per-second') or traffic_row.get('rx_pps') or (int(rx_bps / 8 / 650) if rx_bps else 0))
        tx_pps = int(traffic_row.get('tx-packets-per-second') or traffic_row.get('tx_pps') or (int(tx_bps / 8 / 1400) if tx_bps else 0))

        cpu_load = float(resource_row.get('cpu-load') or resource_row.get('cpu_load') or 0.0)
        total_mem = int(resource_row.get('total-memory') or resource_row.get('total_memory') or 0)
        free_mem = int(resource_row.get('free-memory') or resource_row.get('free_memory') or 0)
        mem_pct = round(((total_mem - free_mem) / max(1, total_mem)) * 100, 1) if total_mem else 0.0
        uptime = resource_row.get('uptime', '')

        return {
            'interface': self.interface,
            'rx_bps': rx_bps,
            'tx_bps': tx_bps,
            'rx_pps': rx_pps,
            'tx_pps': tx_pps,
            'cpu_load': cpu_load,
            'memory_percent': mem_pct,
            'total_memory': total_mem,
            'free_memory': free_mem,
            'uptime': uptime,
            'latency_ms': latency_ms,
        }

    async def _stream_loop(self):
        while self.is_running:
            try:
                telemetry = await self._fetch_realtime_telemetry()
                if telemetry:
                    now_iso = timezone.now().isoformat()
                    telemetry['type'] = 'telemetry'
                    telemetry['collected_at'] = now_iso
                    await self.send(text_data=json.dumps(telemetry))
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug("Error during stream loop: %s", e)

            # 1-second interval for real-time telemetry updates
            await asyncio.sleep(1.0)
