import logging
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.corporate.models import (
    CorporateConnection,
    CorporateTrafficSample,
    TelemetryCollectionStatus,
)

logger = logging.getLogger('corporate.telemetry')


class TelemetryIngestService:
    """
    Ingests 5-minute discrete traffic measurement samples collected
    from network routers/gateways for corporate circuits.
    """

    @classmethod
    def ingest_sample(
        cls,
        connection: CorporateConnection,
        timestamp,
        inbound_bps: int,
        outbound_bps: int,
        inbound_bytes: int = 0,
        outbound_bytes: int = 0,
        collection_status: str = TelemetryCollectionStatus.SUCCESS
    ) -> CorporateTrafficSample:
        """
        Records a single 5-minute discrete traffic sample for a corporate connection.
        """
        if inbound_bps < 0 or outbound_bps < 0:
            raise ValidationError("Traffic rates cannot be negative.")

        sample = CorporateTrafficSample.objects.create(
            tenant=connection.tenant,
            connection=connection,
            timestamp=timestamp,
            inbound_bps=inbound_bps,
            outbound_bps=outbound_bps,
            inbound_bytes=max(0, inbound_bytes),
            outbound_bytes=max(0, outbound_bytes),
            collection_status=collection_status,
        )
        return sample

    @classmethod
    @transaction.atomic
    def bulk_ingest(cls, samples_data: list[dict]) -> int:
        """
        High-throughput bulk ingestion of telemetry samples.
        Each item in samples_data should be a dict matching CorporateTrafficSample fields:
        {
            'tenant': tenant_instance,
            'connection': connection_instance,
            'timestamp': datetime_obj,
            'inbound_bps': int,
            'outbound_bps': int,
            'inbound_bytes': int,
            'outbound_bytes': int,
            'collection_status': status
        }
        """
        records = []
        for item in samples_data:
            records.append(
                CorporateTrafficSample(
                    tenant=item['tenant'],
                    connection=item['connection'],
                    timestamp=item['timestamp'],
                    inbound_bps=max(0, item.get('inbound_bps', 0)),
                    outbound_bps=max(0, item.get('outbound_bps', 0)),
                    inbound_bytes=max(0, item.get('inbound_bytes', 0)),
                    outbound_bytes=max(0, item.get('outbound_bytes', 0)),
                    collection_status=item.get('collection_status', TelemetryCollectionStatus.SUCCESS)
                )
            )

        if records:
            CorporateTrafficSample.objects.bulk_create(records, batch_size=500)
            logger.info("Bulk ingested %d corporate traffic samples", len(records))
            return len(records)
        return 0
