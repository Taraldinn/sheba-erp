"""
Network Topology, Geographical Fiber Map, and Path & Impact Analysis Service (Phase 14).
Builds multi-tier physical & logical graph, GIS coordinate feature maps,
and blast-radius failure impact simulations for ISP network operations.
"""

import logging
from decimal import Decimal
from typing import Any, Optional
from django.db import models
from django.utils import timezone

from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router, OLT, ONU, UserSession, POPBranch

logger = logging.getLogger(__name__)


class NetworkTopologyService:
    """
    Constructs multi-tier topology graph, geographical map data,
    and blast-radius impact analysis for operator NOC visualization.
    """

    @classmethod
    def get_network_topology_graph(cls, tenant: Tenant) -> dict[str, Any]:
        """
        Constructs a structured multi-tier topology graph:
        Tier 1: POP Branches / Datacenter
        Tier 2: Core BNG Routers (MikroTik)
        Tier 3: OLT Frames (Huawei / ZTE / VSOL)
        Tier 4: PON Ports
        Tier 5: ONU / Optical Terminals
        Tier 6: Subscriber Endpoints (Customer)
        """
        pops = POPBranch.objects.filter(tenant=tenant)
        routers = Router.objects.filter(tenant=tenant)
        olts = OLT.objects.filter(tenant=tenant).select_related('upstream_router', 'pop_branch')
        onus = ONU.objects.filter(tenant=tenant).select_related('customer')
        customers = Customer.objects.filter(tenant=tenant)
        active_sessions = set(UserSession.objects.filter(tenant=tenant).values_list('username', flat=True))

        # Map router -> POP using explicit OLT pop_branch relationship
        router_to_pop: dict[Any, POPBranch] = {}
        for o in olts:
            if o.upstream_router_id and o.pop_branch:
                router_to_pop[o.upstream_router_id] = o.pop_branch

        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []

        # 1. POP Nodes
        for p in pops:
            nodes.append({
                'id': f"pop_{p.id}",
                'label': p.name,
                'type': 'POP',
                'tier': 1,
                'status': 'Online' if p.status == 'Active' else 'Offline',
                'details': {
                    'code': p.code,
                    'location': p.location,
                    'total_capacity': p.total_capacity,
                    'power_backup': p.power_backup,
                }
            })

        # 2. Router Nodes & POP -> Router Edges
        for r in routers:
            r_node_id = f"router_{r.id}"
            nodes.append({
                'id': r_node_id,
                'label': r.name,
                'type': 'Router',
                'tier': 2,
                'status': r.status,
                'details': {
                    'ip_address': r.ip_address,
                    'effective_host': r.effective_host,
                    'cpu_usage': r.cpu_usage,
                    'memory_usage': r.memory_usage,
                    'uptime': r.uptime,
                    'active_sessions': r.active_pppoe_count,
                    'version': r.routeros_version,
                }
            })
            # Connect to primary POP via explicit OLT pop_branch relationship if present
            parent_pop = router_to_pop.get(r.id)
            if parent_pop:
                edges.append({
                    'id': f"edge_pop_{parent_pop.id}_router_{r.id}",
                    'source': f"pop_{parent_pop.id}",
                    'target': r_node_id,
                    'type': 'Core-Backbone',
                    'capacity': '10Gbps',
                    'status': 'Healthy' if r.status == 'Online' else 'Degraded',
                })

        # 3. OLT Nodes & Router -> OLT Edges
        for o in olts:
            o_node_id = f"olt_{o.id}"
            nodes.append({
                'id': o_node_id,
                'label': o.name,
                'type': 'OLT',
                'tier': 3,
                'status': o.status,
                'details': {
                    'brand': o.get_brand_display(),
                    'ip_address': o.ip_address,
                    'pon_ports_count': o.pon_ports_count,
                    'total_onus': o.total_onus,
                    'online_onus': o.online_onus,
                }
            })
            # Upstream router link (uses only o.upstream_router, omits edge if none)
            parent_router = o.upstream_router
            if parent_router:
                edges.append({
                    'id': f"edge_router_{parent_router.id}_olt_{o.id}",
                    'source': f"router_{parent_router.id}",
                    'target': o_node_id,
                    'type': 'Distribution-Trunk',
                    'capacity': '10G/1G Uplink',
                    'status': 'Healthy' if o.status == 'Online' else 'Down',
                })

        # 4. Group ONUs by PON port to keep the graph high-performance
        pon_summary: dict[str, dict[str, Any]] = {}
        for onu in onus:
            key = f"{onu.olt_id}_{onu.pon_port}"
            if key not in pon_summary:
                pon_summary[key] = {
                    'olt_id': str(onu.olt_id),
                    'pon_port': onu.pon_port,
                    'total': 0,
                    'online': 0,
                    'alerts': 0,
                    'sample_customers': []
                }
            pon_summary[key]['total'] += 1
            if onu.status == 'Online':
                pon_summary[key]['online'] += 1
            if onu.status in ('DyingGasp', 'Los') or onu.rx_power < Decimal('-27.00'):
                pon_summary[key]['alerts'] += 1
            if onu.customer and len(pon_summary[key]['sample_customers']) < 5:
                pon_summary[key]['sample_customers'].append({
                    'id': str(onu.customer.id),
                    'name': onu.customer.full_name,
                    'username': onu.customer.pppoe_username,
                    'is_online': onu.customer.pppoe_username in active_sessions
                })

        # 5. PON Nodes & OLT -> PON Edges
        for key, pdata in pon_summary.items():
            pon_node_id = f"pon_{key}"
            has_alert = pdata['alerts'] > 0
            is_down = pdata['online'] == 0 and pdata['total'] > 0
            pon_status = 'Critical' if is_down else ('Warning' if has_alert else 'Healthy')

            nodes.append({
                'id': pon_node_id,
                'label': f"{pdata['pon_port']} ({pdata['online']}/{pdata['total']})",
                'type': 'PON-Port',
                'tier': 4,
                'status': pon_status,
                'details': {
                    'pon_port': pdata['pon_port'],
                    'online_count': pdata['online'],
                    'total_count': pdata['total'],
                    'alerts_count': pdata['alerts'],
                    'sample_customers': pdata['sample_customers']
                }
            })
            edges.append({
                'id': f"edge_olt_{pdata['olt_id']}_{pon_node_id}",
                'source': f"olt_{pdata['olt_id']}",
                'target': pon_node_id,
                'type': 'GPON/EPON-Splitter',
                'capacity': '2.5Gbps / 1.25Gbps',
                'status': 'Degraded' if has_alert else ('Down' if is_down else 'Healthy'),
            })

        return {
            'graph': {
                'nodes': nodes,
                'edges': edges,
            },
            'summary': {
                'total_nodes': len(nodes),
                'total_edges': len(edges),
                'pop_count': pops.count(),
                'router_count': routers.count(),
                'olt_count': olts.count(),
                'pon_count': len(pon_summary),
                'total_customers': customers.count(),
                'online_customers': len(active_sessions),
            },
            'timestamp': timezone.now().isoformat()
        }

    @classmethod
    def get_geographical_fiber_map(cls, tenant: Tenant) -> dict[str, Any]:
        """
        Returns GeoJSON features representing geographical network assets:
        - Points for POP Branches, Routers, OLTs, and Customers.
        - LineStrings for fiber path corridors linking them.
        """
        # Center coordinates default to Dhaka ISP NOC or tenant's first asset
        default_lat, default_lng = 23.8103, 90.4125

        pops = POPBranch.objects.filter(tenant=tenant)
        routers = Router.objects.filter(tenant=tenant)
        olts = OLT.objects.filter(tenant=tenant).select_related('upstream_router', 'pop_branch')
        customers = Customer.objects.filter(tenant=tenant)
        active_sessions = set(UserSession.objects.filter(tenant=tenant).values_list('username', flat=True))

        # Map router -> POP using explicit OLT pop_branch relationship
        router_to_pop: dict[Any, POPBranch] = {}
        for o in olts:
            if o.upstream_router_id and o.pop_branch:
                router_to_pop[o.upstream_router_id] = o.pop_branch

        # Compute asset coordinates once from stored latitude/longitude values without synthetic fallbacks
        pop_coords: dict[Any, list[float]] = {
            p.id: [float(p.longitude), float(p.latitude)]
            for p in pops
            if p.latitude is not None and p.longitude is not None
        }
        router_coords: dict[Any, list[float]] = {
            r.id: [float(r.longitude), float(r.latitude)]
            for r in routers
            if r.latitude is not None and r.longitude is not None
        }
        olt_coords: dict[Any, list[float]] = {
            o.id: [float(o.longitude), float(o.latitude)]
            for o in olts
            if o.latitude is not None and o.longitude is not None
        }
        cust_coords: dict[Any, list[float]] = {
            c.id: [float(c.longitude), float(c.latitude)]
            for c in customers[:250]
            if c.latitude is not None and c.longitude is not None
        }

        features: list[dict[str, Any]] = []

        # POP Points (omit if lacking coordinates)
        for p in pops:
            coords = pop_coords.get(p.id)
            if not coords:
                continue
            features.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': coords
                },
                'properties': {
                    'id': str(p.id),
                    'category': 'POP',
                    'name': p.name,
                    'code': p.code,
                    'location': p.location,
                    'status': p.status,
                    'capacity': p.total_capacity,
                }
            })

        # Router Points (omit if lacking coordinates)
        for r in routers:
            coords = router_coords.get(r.id)
            if not coords:
                continue
            features.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': coords
                },
                'properties': {
                    'id': str(r.id),
                    'category': 'Router',
                    'name': r.name,
                    'ip_address': r.ip_address,
                    'status': r.status,
                    'active_sessions': r.active_pppoe_count,
                    'cpu_usage': r.cpu_usage,
                }
            })

        # OLT Points (omit if lacking coordinates)
        for o in olts:
            coords = olt_coords.get(o.id)
            if not coords:
                continue
            features.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': coords
                },
                'properties': {
                    'id': str(o.id),
                    'category': 'OLT',
                    'name': o.name,
                    'brand': o.brand,
                    'ip_address': o.ip_address,
                    'status': o.status,
                    'online_onus': o.online_onus,
                    'total_onus': o.total_onus,
                }
            })

        # Customer Endpoints (omit if lacking coordinates)
        for c in customers[:250]:
            coords = cust_coords.get(c.id)
            if not coords:
                continue
            is_online = c.pppoe_username in active_sessions
            features.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': coords
                },
                'properties': {
                    'id': str(c.id),
                    'category': 'Customer',
                    'name': c.full_name,
                    'customer_code': c.customer_code,
                    'pppoe_username': c.pppoe_username,
                    'status': c.status,
                    'is_online': is_online,
                    'area_zone': c.area_zone,
                    'monthly_bill': str(c.monthly_bill),
                }
            })

        # Fiber Cables (Connecting Lines)
        # Backbone Links: POP -> Router (skip if either endpoint coordinate is unavailable)
        for r in routers:
            parent_pop = router_to_pop.get(r.id) or (pops.first() if pops.exists() and not router_to_pop else None)
            if not parent_pop:
                continue
            p_coords = pop_coords.get(parent_pop.id)
            r_coords = router_coords.get(r.id)
            if not p_coords or not r_coords:
                continue
            features.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [p_coords, r_coords]
                },
                'properties': {
                    'category': 'FiberLink',
                    'link_type': 'Core-Backbone',
                    'source_name': parent_pop.name,
                    'target_name': r.name,
                    'capacity': '10Gbps Core Fiber',
                    'status': 'Healthy' if r.status == 'Online' else 'Down'
                }
            })

        # Distribution Links: Router -> OLT (skip if either endpoint coordinate is unavailable)
        for o in olts:
            parent_router = o.upstream_router
            if not parent_router:
                continue
            r_coords = router_coords.get(parent_router.id)
            o_coords = olt_coords.get(o.id)
            if not r_coords or not o_coords:
                continue
            features.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [r_coords, o_coords]
                },
                'properties': {
                    'category': 'FiberLink',
                    'link_type': 'Distribution-Trunk',
                    'source_name': parent_router.name,
                    'target_name': o.name,
                    'capacity': '10G Trunk Fiber',
                    'status': 'Healthy' if o.status == 'Online' else 'Down'
                }
            })

        map_center = [default_lng, default_lat]
        if pop_coords:
            map_center = list(pop_coords.values())[0]
        elif router_coords:
            map_center = list(router_coords.values())[0]
        elif olt_coords:
            map_center = list(olt_coords.values())[0]

        return {
            'type': 'FeatureCollection',
            'features': features,
            'map_center': map_center,
            'zoom': 13,
            'timestamp': timezone.now().isoformat()
        }

    @classmethod
    def calculate_path_and_impact(
        cls,
        tenant: Tenant,
        target_type: str,
        target_id: str
    ) -> dict[str, Any]:
        """
        Simulates network failure and calculates path and blast radius impact:
        - Affected subscribers (total, online, active, expired)
        - Monthly Recurring Revenue (MRR) at risk
        - Total bandwidth throughput impacted
        - Dependent hardware downstream (OLTs, PON ports, ONUs)
        - Trace physical path up to Core POP
        """
        target_type = target_type.lower().strip()
        impacted_customers = Customer.objects.none()
        downstream_olts = []
        downstream_onus = []
        affected_pons = []
        path_trace = []

        active_sessions = set(UserSession.objects.filter(tenant=tenant).values_list('username', flat=True))

        if target_type == 'pop':
            pop = POPBranch.objects.filter(tenant=tenant, id=target_id).first()
            if not pop:
                return {'error': 'POP not found'}
            path_trace = [f"POP: {pop.name}"]
            olts = OLT.objects.filter(tenant=tenant, pop_branch=pop)
            downstream_olts = list(olts.values('id', 'name', 'brand', 'ip_address'))
            downstream_onus = list(ONU.objects.filter(tenant=tenant, olt__in=olts).values('id', 'pon_port', 'serial_number'))
            impacted_customers = Customer.objects.filter(
                models.Q(tenant=tenant, area_zone__icontains=pop.name) |
                models.Q(tenant=tenant, onus__olt__in=olts)
            ).distinct()

        elif target_type == 'router':
            router = Router.objects.filter(tenant=tenant, id=target_id).first()
            if not router:
                return {'error': 'Router not found'}
            path_trace = ["Core NOC / POP", f"Router: {router.name} ({router.ip_address})"]
            olts = OLT.objects.filter(tenant=tenant, upstream_router=router)
            downstream_olts = list(olts.values('id', 'name', 'brand', 'ip_address'))
            downstream_onus = list(ONU.objects.filter(tenant=tenant, olt__in=olts).values('id', 'pon_port', 'serial_number'))
            impacted_customers = Customer.objects.filter(tenant=tenant, router=router)

        elif target_type == 'olt':
            olt = OLT.objects.filter(tenant=tenant, id=target_id).select_related('upstream_router', 'pop_branch').first()
            if not olt:
                return {'error': 'OLT not found'}
            router_name = olt.upstream_router.name if olt.upstream_router else 'Core Router'
            pop_name = olt.pop_branch.name if olt.pop_branch else 'Main POP'
            path_trace = [f"POP: {pop_name}", f"Router: {router_name}", f"OLT: {olt.name} ({olt.ip_address})"]
            downstream_olts = [{'id': str(olt.id), 'name': olt.name, 'brand': olt.brand}]
            onu_qs = ONU.objects.filter(tenant=tenant, olt=olt)
            downstream_onus = list(onu_qs.values('id', 'pon_port', 'serial_number', 'mac_address'))
            affected_pons = sorted(list(set(onu_qs.values_list('pon_port', flat=True))))
            impacted_customers = Customer.objects.filter(tenant=tenant, onus__in=onu_qs).distinct()

        elif target_type in ('pon', 'pon_port'):
            # target_id format: "oltId_ponPort" or just "EPON0/1"
            parts = target_id.split('_')
            olt_id = parts[0] if len(parts) > 1 else None
            pon_port = parts[1] if len(parts) > 1 else target_id

            onu_qs = ONU.objects.filter(tenant=tenant, pon_port=pon_port)
            if olt_id:
                onu_qs = onu_qs.filter(olt_id=olt_id)
            first_onu = onu_qs.select_related('olt').first()
            olt_name = first_onu.olt.name if first_onu and first_onu.olt else 'OLT'
            path_trace = ["Core NOC", olt_name, f"PON Interface: {pon_port}"]
            downstream_onus = list(onu_qs.values('id', 'pon_port', 'serial_number', 'mac_address'))
            affected_pons = [pon_port]
            impacted_customers = Customer.objects.filter(tenant=tenant, onus__in=onu_qs).distinct()

        else:
            return {'error': f"Unknown target_type: {target_type}. Valid: pop, router, olt, pon"}

        # Calculate metrics
        total_subscribers = impacted_customers.count()
        online_subscribers = 0
        mrr_at_risk = Decimal('0.00')

        customer_details = []
        for c in impacted_customers[:100]:
            is_on = c.pppoe_username in active_sessions
            if is_on:
                online_subscribers += 1
            mrr_at_risk += c.monthly_bill
            customer_details.append({
                'id': str(c.id),
                'customer_code': c.customer_code,
                'name': c.full_name,
                'pppoe_username': c.pppoe_username,
                'mobile': c.mobile,
                'area_zone': c.area_zone,
                'monthly_bill': str(c.monthly_bill),
                'status': c.status,
                'is_online': is_on,
            })

        # Remaining customers revenue calculation
        if total_subscribers > 100:
            remaining_mrr = impacted_customers[100:].aggregate(total_bill=models.Sum('monthly_bill'))
            mrr_at_risk += (remaining_mrr['total_bill'] or Decimal('0.00'))

        # Estimated bandwidth impact (approx 2.5 Mbps avg per active subscriber)
        est_bandwidth_impact_mbps = round(online_subscribers * 2.8, 1)

        # Service package breakdown
        package_breakdown_dict = {}
        for c in impacted_customers:
            pkg_name = c.package.name if c.package else 'Default Package'
            if pkg_name not in package_breakdown_dict:
                package_breakdown_dict[pkg_name] = {'package_name': pkg_name, 'subscribers_count': 0, 'mrr_at_risk': Decimal('0.00')}
            package_breakdown_dict[pkg_name]['subscribers_count'] += 1
            package_breakdown_dict[pkg_name]['mrr_at_risk'] += (c.monthly_bill or Decimal('0.00'))

        package_breakdown = [
            {
                'package_name': v['package_name'],
                'subscribers_count': v['subscribers_count'],
                'mrr_at_risk': str(v['mrr_at_risk'])
            }
            for v in package_breakdown_dict.values()
        ]

        return {
            'target_type': target_type,
            'target_id': target_id,
            'path_trace': path_trace,
            'impact_summary': {
                'total_subscribers_affected': total_subscribers,
                'online_subscribers_affected': online_subscribers,
                'offline_subscribers': max(0, total_subscribers - online_subscribers),
                'mrr_at_risk': str(mrr_at_risk),
                'currency': 'BDT',
                'estimated_bandwidth_loss_mbps': est_bandwidth_impact_mbps,
                'dependent_olts_count': len(downstream_olts),
                'dependent_pons_count': len(affected_pons),
                'dependent_onus_count': len(downstream_onus),
            },
            'package_breakdown': package_breakdown,
            'downstream_hardware': {
                'olts': downstream_olts,
                'pon_ports': affected_pons,
                'onus_sample': downstream_onus[:20],
            },
            'affected_customers_sample': customer_details,
            'suggested_remediation': [
                "Verify upstream link status and power backup in Datacenter/POP.",
                "Reroute downstream VLAN / PPPoE trunks if redundant BNG path is active.",
                "Broadcast maintenance or outage SMS to affected subscribers.",
            ],
            'timestamp': timezone.now().isoformat()
        }

    @classmethod
    def get_authoritative_hierarchy(cls, tenant: Tenant) -> dict[str, Any]:
        """
        Phase 20: Derives the read-oriented authoritative network hierarchy:
        Internet → Router → POP → OLT → PON → ONU (summary counts) → Customer (summary counts)

        Optimized for large ISPs: Returns structural tree down to PON ports with aggregate child counts.
        Individual ONUs and customers are paged via get_topology_drilldown() to protect browser DOM.
        """
        routers = Router.objects.filter(tenant=tenant).order_by('name')
        pops = POPBranch.objects.filter(tenant=tenant).select_related('upstream_router').order_by('name')
        olts = OLT.objects.filter(tenant=tenant).select_related('upstream_router', 'pop_branch').order_by('name')
        onus = ONU.objects.filter(tenant=tenant).select_related('olt', 'customer')
        active_sessions = set(UserSession.objects.filter(tenant=tenant).values_list('username', flat=True))

        # Group ONUs by OLT and PON port
        # key: (olt_id, pon_port) -> { total, online, alarms, customer_ids }
        pon_map: dict[tuple[Any, str], dict[str, Any]] = {}
        for onu in onus:
            key = (onu.olt_id, onu.pon_port)
            if key not in pon_map:
                pon_map[key] = {
                    'total': 0,
                    'online': 0,
                    'alarms': 0,
                    'customer_count': 0,
                }
            pon_map[key]['total'] += 1
            if onu.status == 'Online':
                pon_map[key]['online'] += 1
            if onu.status in ('DyingGasp', 'Los', 'PowerLoss') or (onu.rx_power is not None and onu.rx_power < Decimal('-27.00')):
                pon_map[key]['alarms'] += 1
            if onu.customer_id:
                pon_map[key]['customer_count'] += 1

        # Pre-group OLTs by POP
        # pop_id -> list[OLT]
        pop_to_olts: dict[Any, list[OLT]] = {}
        standalone_olts: list[OLT] = []
        for o in olts:
            if o.pop_branch_id:
                pop_to_olts.setdefault(o.pop_branch_id, []).append(o)
            else:
                standalone_olts.append(o)

        # Pre-group POPs by Router
        # router_id -> list[POPBranch]
        router_to_pops: dict[Any, list[POPBranch]] = {}
        standalone_pops: list[POPBranch] = []
        for p in pops:
            if p.upstream_router_id:
                router_to_pops.setdefault(p.upstream_router_id, []).append(p)
            else:
                # Check if any OLT in this POP links to a router
                linked_router_id = None
                for o in pop_to_olts.get(p.id, []):
                    if o.upstream_router_id:
                        linked_router_id = o.upstream_router_id
                        break
                if linked_router_id:
                    router_to_pops.setdefault(linked_router_id, []).append(p)
                else:
                    standalone_pops.append(p)

        def build_olt_node(olt: OLT) -> dict[str, Any]:
            # Distinct PON ports for this OLT
            olt_pons = []
            olt_total_onus = 0
            olt_online_onus = 0
            olt_alarm_onus = 0
            olt_customer_count = 0

            # Scan pon_map for this olt
            for (o_id, p_port), stats in pon_map.items():
                if o_id == olt.id:
                    olt_total_onus += stats['total']
                    olt_online_onus += stats['online']
                    olt_alarm_onus += stats['alarms']
                    olt_customer_count += stats['customer_count']

                    is_down = stats['total'] > 0 and stats['online'] == 0
                    has_alert = stats['alarms'] > 0
                    pon_health = 'Critical' if is_down else ('Warning' if has_alert else 'Online')

                    olt_pons.append({
                        'id': f"pon_{olt.id}_{p_port}",
                        'name': p_port,
                        'type': 'PON',
                        'olt_id': str(olt.id),
                        'pon_port': p_port,
                        'health': pon_health,
                        'total_onus': stats['total'],
                        'online_onus': stats['online'],
                        'alarm_onus': stats['alarms'],
                        'customer_count': stats['customer_count'],
                        'drilldown_available': True,
                    })

            olt_pons.sort(key=lambda x: x['name'])

            # Determine OLT health
            olt_health = 'Offline'
            if olt.status == 'Online':
                if olt_alarm_onus > 0 or (olt_total_onus > 0 and olt_online_onus < olt_total_onus):
                    olt_health = 'Degraded'
                else:
                    olt_health = 'Online'
            elif olt.status == 'Maintenance':
                olt_health = 'Degraded'

            return {
                'id': f"olt_{olt.id}",
                'raw_id': str(olt.id),
                'name': olt.name,
                'type': 'OLT',
                'brand': olt.brand,
                'ip_address': olt.ip_address,
                'status': olt.status,
                'health': olt_health,
                'total_onus': olt_total_onus or olt.total_onus,
                'online_onus': olt_online_onus or olt.online_onus,
                'customer_count': olt_customer_count,
                'pon_count': len(olt_pons),
                'children': olt_pons,
            }

        def build_pop_node(pop: POPBranch) -> dict[str, Any]:
            pop_olts = pop_to_olts.get(pop.id, [])
            olt_nodes = [build_olt_node(o) for o in pop_olts]

            pop_total_onus = sum(n['total_onus'] for n in olt_nodes)
            pop_online_onus = sum(n['online_onus'] for n in olt_nodes)
            pop_customers = sum(n['customer_count'] for n in olt_nodes)

            pop_health = 'Online' if pop.status == 'Active' else 'Offline'
            if pop.power_backup in ('Generator', 'Battery', 'Solar', 'UPS'):
                pop_health = 'Degraded'

            return {
                'id': f"pop_{pop.id}",
                'raw_id': str(pop.id),
                'name': pop.name,
                'code': pop.code,
                'type': 'POP',
                'location': pop.location,
                'status': pop.status,
                'health': pop_health,
                'power_backup': pop.power_backup,
                'olt_count': len(olt_nodes),
                'total_onus': pop_total_onus,
                'online_onus': pop_online_onus,
                'customer_count': pop_customers,
                'children': olt_nodes,
            }

        router_nodes = []
        for r in routers:
            r_pops = router_to_pops.get(r.id, [])
            pop_nodes = [build_pop_node(p) for p in r_pops]

            # Direct router customers count
            r_cust_count = Customer.objects.filter(tenant=tenant, router=r).count()

            # Health indicator for router
            r_cpu = r.cpu_usage or 0
            r_mem = r.memory_usage or 0
            if r.status != 'Online':
                r_health = 'Offline'
            elif r_cpu > 85 or r_mem > 85:
                r_health = 'Degraded'
            else:
                r_health = 'Online'

            router_nodes.append({
                'id': f"router_{r.id}",
                'raw_id': str(r.id),
                'name': r.name,
                'type': 'Router',
                'ip_address': r.ip_address,
                'effective_host': r.effective_host,
                'status': r.status,
                'health': r_health,
                'cpu_usage': r_cpu,
                'memory_usage': r_mem,
                'active_sessions': r.active_pppoe_count,
                'customer_count': r_cust_count,
                'pop_count': len(pop_nodes),
                'children': pop_nodes,
            })

        # Handle any standalone POPs not assigned to a specific router
        if standalone_pops:
            unassigned_pop_nodes = [build_pop_node(p) for p in standalone_pops]
            router_nodes.append({
                'id': 'router_unassigned',
                'raw_id': 'unassigned',
                'name': 'Unassigned Gateway / Standalone POPs',
                'type': 'RouterGroup',
                'ip_address': '0.0.0.0',
                'status': 'Online',
                'health': 'Online',
                'cpu_usage': 0,
                'memory_usage': 0,
                'active_sessions': 0,
                'customer_count': 0,
                'pop_count': len(unassigned_pop_nodes),
                'children': unassigned_pop_nodes,
            })

        # Top-level authoritative tree
        root = {
            'id': 'internet_gateway',
            'name': 'Internet Gateway (BGP Upstream / Transit)',
            'type': 'Internet',
            'status': 'Online',
            'health': 'Online',
            'total_routers': len(routers),
            'total_pops': len(pops),
            'total_olts': len(olts),
            'total_customers': Customer.objects.filter(tenant=tenant).count(),
            'online_customers': len(active_sessions),
            'children': router_nodes,
        }

        return {
            'authoritative_hierarchy': root,
            'chain': 'Internet → Router → POP → OLT → PON → ONU → Customer',
            'timestamp': timezone.now().isoformat(),
        }

    @classmethod
    def get_topology_drilldown(
        cls,
        tenant: Tenant,
        node_type: str,
        node_id: str,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Phase 20: On-demand drilldown endpoint for large ISPs.
        Fetches child devices or customer endpoints without loading thousands of DOM nodes at once.
        Supports node_type in ('pon', 'onu', 'olt', 'pop', 'router').
        """
        node_type = node_type.lower().strip()
        page = max(1, int(page))
        page_size = min(100, max(1, int(page_size)))
        active_sessions = set(UserSession.objects.filter(tenant=tenant).values_list('username', flat=True))

        if node_type in ('pon', 'pon_port'):
            # Format: "oltId_ponPort" or just "ponPort"
            parts = node_id.split('_')
            olt_id = parts[0] if len(parts) > 1 else None
            pon_port = parts[1] if len(parts) > 1 else node_id

            qs = ONU.objects.filter(tenant=tenant, pon_port=pon_port).select_related('olt', 'customer', 'customer__package', 'customer__router')
            if olt_id:
                qs = qs.filter(olt_id=olt_id)

            if search:
                s = search.strip()
                qs = qs.filter(
                    models.Q(serial_number__icontains=s) |
                    models.Q(mac_address__icontains=s) |
                    models.Q(customer__full_name__icontains=s) |
                    models.Q(customer__pppoe_username__icontains=s)
                )

            total_count = qs.count()
            start = (page - 1) * page_size
            end = start + page_size
            paged_onus = qs[start:end]

            results = []
            for onu in paged_onus:
                rx_p = float(onu.rx_power) if onu.rx_power is not None else -22.0
                is_alert = onu.status in ('DyingGasp', 'Los', 'PowerLoss') or rx_p < -27.0
                health = 'Critical' if onu.status in ('DyingGasp', 'Los', 'PowerLoss') else ('Warning' if is_alert else ('Online' if onu.status == 'Online' else 'Offline'))

                cust_info = None
                if onu.customer:
                    is_on = onu.customer.pppoe_username in active_sessions
                    cust_info = {
                        'id': str(onu.customer.id),
                        'customer_code': onu.customer.customer_code,
                        'name': onu.customer.full_name,
                        'pppoe_username': onu.customer.pppoe_username,
                        'mobile': onu.customer.mobile,
                        'package_name': onu.customer.package.name if onu.customer.package else 'Default Package',
                        'monthly_bill': str(onu.customer.monthly_bill),
                        'status': onu.customer.status,
                        'is_online': is_on,
                        'router_name': onu.customer.router.name if onu.customer.router else 'Core Router',
                    }

                results.append({
                    'id': str(onu.id),
                    'serial_number': onu.serial_number,
                    'mac_address': onu.mac_address,
                    'pon_port': onu.pon_port,
                    'status': onu.status,
                    'optical_status': onu.optical_status,
                    'rx_power': str(onu.rx_power) if onu.rx_power is not None else '-22.00',
                    'health': health,
                    'olt_id': str(onu.olt_id),
                    'olt_name': onu.olt.name if onu.olt else '',
                    'customer': cust_info,
                })

            return {
                'node_type': 'pon',
                'node_id': node_id,
                'pon_port': pon_port,
                'page': page,
                'page_size': page_size,
                'total_count': total_count,
                'total_pages': (total_count + page_size - 1) // page_size if total_count > 0 else 1,
                'results': results,
            }

        elif node_type == 'onu':
            onu = ONU.objects.filter(tenant=tenant, id=node_id).select_related('olt', 'olt__pop_branch', 'olt__upstream_router', 'customer', 'customer__package', 'customer__router').first()
            if not onu:
                return {'error': 'ONU not found'}

            cust_info = None
            if onu.customer:
                is_on = onu.customer.pppoe_username in active_sessions
                cust_info = {
                    'id': str(onu.customer.id),
                    'customer_code': onu.customer.customer_code,
                    'name': onu.customer.full_name,
                    'pppoe_username': onu.customer.pppoe_username,
                    'mobile': onu.customer.mobile,
                    'email': onu.customer.email,
                    'package_name': onu.customer.package.name if onu.customer.package else 'Default Package',
                    'monthly_bill': str(onu.customer.monthly_bill),
                    'due_amount': str(onu.customer.due_amount),
                    'status': onu.customer.status,
                    'is_online': is_on,
                    'connection_type': onu.customer.connection_type,
                    'router_name': onu.customer.router.name if onu.customer.router else 'Core Router',
                }

            upstream_olt = onu.olt
            upstream_pop = upstream_olt.pop_branch if upstream_olt else None
            upstream_router = (upstream_olt.upstream_router if upstream_olt else None) or (upstream_pop.upstream_router if upstream_pop else None)

            return {
                'node_type': 'onu',
                'node_id': node_id,
                'onu': {
                    'id': str(onu.id),
                    'serial_number': onu.serial_number,
                    'mac_address': onu.mac_address,
                    'pon_port': onu.pon_port,
                    'status': onu.status,
                    'optical_status': onu.optical_status,
                    'rx_power': str(onu.rx_power) if onu.rx_power is not None else '-22.00',
                },
                'authoritative_path': {
                    'internet': 'Internet Gateway',
                    'router': upstream_router.name if upstream_router else 'Core BNG',
                    'pop': upstream_pop.name if upstream_pop else 'Main POP',
                    'olt': upstream_olt.name if upstream_olt else 'OLT Frame',
                    'pon': onu.pon_port,
                    'onu': onu.serial_number or onu.mac_address,
                    'customer': cust_info['name'] if cust_info else 'Unbound',
                },
                'customer': cust_info,
            }

        elif node_type == 'olt':
            olt = OLT.objects.filter(tenant=tenant, id=node_id).first()
            if not olt:
                return {'error': 'OLT not found'}

            pon_ports = list(ONU.objects.filter(tenant=tenant, olt=olt).values_list('pon_port', flat=True).distinct())
            pon_ports.sort()

            return {
                'node_type': 'olt',
                'node_id': node_id,
                'olt': {
                    'id': str(olt.id),
                    'name': olt.name,
                    'brand': olt.brand,
                    'ip_address': olt.ip_address,
                    'status': olt.status,
                    'total_onus': olt.total_onus,
                    'online_onus': olt.online_onus,
                },
                'pon_ports': pon_ports,
            }

        elif node_type == 'pop':
            pop = POPBranch.objects.filter(tenant=tenant, id=node_id).first()
            if not pop:
                return {'error': 'POP not found'}

            olts = OLT.objects.filter(tenant=tenant, pop_branch=pop).values('id', 'name', 'brand', 'ip_address', 'status', 'total_onus', 'online_onus')
            return {
                'node_type': 'pop',
                'node_id': node_id,
                'pop': {
                    'id': str(pop.id),
                    'name': pop.name,
                    'code': pop.code,
                    'location': pop.location,
                    'status': pop.status,
                    'power_backup': pop.power_backup,
                },
                'olts': list(olts),
            }

        elif node_type == 'router':
            router = Router.objects.filter(tenant=tenant, id=node_id).first()
            if not router:
                return {'error': 'Router not found'}

            downstream_pops = POPBranch.objects.filter(tenant=tenant, upstream_router=router).values('id', 'name', 'code', 'status')
            downstream_olts = OLT.objects.filter(tenant=tenant, upstream_router=router).values('id', 'name', 'brand', 'status')
            return {
                'node_type': 'router',
                'node_id': node_id,
                'router': {
                    'id': str(router.id),
                    'name': router.name,
                    'ip_address': router.ip_address,
                    'status': router.status,
                    'cpu_usage': router.cpu_usage,
                    'memory_usage': router.memory_usage,
                    'active_sessions': router.active_pppoe_count,
                },
                'pops': list(downstream_pops),
                'olts': list(downstream_olts),
            }

        else:
            return {'error': f"Unknown node_type: {node_type}. Valid: pon, onu, olt, pop, router"}

