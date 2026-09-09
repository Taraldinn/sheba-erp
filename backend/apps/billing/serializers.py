from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Package, ResellerPricing, Invoice, Recharge, Offer


def _tenant_from_context(context):
    request = context.get('request')
    return getattr(request, 'tenant', None) if request else None


class PackageSerializer(serializers.ModelSerializer):
    subscribers_count = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = [
            'id', 'name', 'mikrotik_profile', 'speed_mbps', 'upload_speed_mbps',
            'validity_days', 'regular_price', 'min_reseller_price', 'description',
            'is_active', 'subscribers_count', 'created_at'
        ]
        read_only_fields = ('tenant',)

    @extend_schema_field(serializers.IntegerField())
    def get_subscribers_count(self, obj):
        return obj.subscribers.count()


class ResellerPricingSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source='package.name', read_only=True)
    reseller_username = serializers.CharField(source='reseller.user.username', read_only=True)

    class Meta:
        model = ResellerPricing
        fields = ['id', 'reseller', 'reseller_username', 'package', 'package_name', 'custom_price', 'created_at']
        read_only_fields = ('tenant',)

    def validate_reseller(self, reseller):
        if reseller is None:
            return reseller
        tenant = _tenant_from_context(self.context)
        if tenant and reseller.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected reseller does not belong to your ISP. Cross-tenant pricing is not allowed."
            )
        return reseller

    def validate_package(self, package):
        if package is None:
            return package
        tenant = _tenant_from_context(self.context)
        if tenant and package.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected package does not belong to your ISP. Cross-tenant pricing is not allowed."
            )
        return package


class InvoiceSerializer(serializers.ModelSerializer):
    """
    Invoice serializer with cross-FK tenant ownership validation (Plan Phase 7).
    Validates: invoice.customer.tenant == request.tenant
    Supports itemized invoice lines.
    """
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_username = serializers.CharField(source='customer.pppoe_username', read_only=True)
    lines = serializers.SerializerMethodField(read_only=True)
    invoice_no = serializers.CharField(max_length=50, required=False)
    package_amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    total_payable = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)

    class Meta:
        model = Invoice
        fields = '__all__'
        read_only_fields = ('tenant',)

    def get_lines(self, obj):
        from apps.finance.serializers import InvoiceLineSerializer
        lines = obj.lines.all()
        return InvoiceLineSerializer(lines, many=True).data

    def validate(self, attrs):
        from decimal import Decimal
        initial_lines = getattr(self, 'initial_data', {}).get('lines')
        if initial_lines and isinstance(initial_lines, list):
            if 'package_amount' not in attrs:
                total_pkg = sum(
                    Decimal(str(l.get('unit_price', '0.00'))) * Decimal(str(l.get('quantity', '1.000')))
                    for l in initial_lines
                )
                attrs['package_amount'] = total_pkg
            if 'total_payable' not in attrs:
                tot_lines = sum(
                    (Decimal(str(l.get('unit_price', '0.00'))) * Decimal(str(l.get('quantity', '1.000'))))
                    - Decimal(str(l.get('discount', '0.00')))
                    + Decimal(str(l.get('tax_amount', '0.00')))
                    for l in initial_lines
                )
                inv_discount = Decimal(str(attrs.get('discount', '0.00')))
                attrs['total_payable'] = max(Decimal('0.00'), tot_lines - inv_discount)
        return super().validate(attrs)

    def validate_customer(self, customer):
        """Ensure invoice is raised against a customer of this tenant."""
        tenant = _tenant_from_context(self.context)
        if tenant and customer.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Customer does not belong to your ISP. Cross-tenant invoice is not allowed."
            )
        return customer

    def create(self, validated_data):
        initial_data = getattr(self, 'initial_data', {})
        lines_data = initial_data.get('lines', None)
        tenant = _tenant_from_context(self.context) or validated_data.get('tenant')
        customer = validated_data.get('customer')

        if not validated_data.get('invoice_no'):
            import uuid
            from django.utils import timezone
            now = timezone.now()
            validated_data['invoice_no'] = f"INV-{now.strftime('%y%m')}-{uuid.uuid4().hex[:6].upper()}"

        if lines_data is not None and isinstance(lines_data, list):
            from apps.finance.services import create_invoice_with_lines
            from decimal import Decimal
            discount = validated_data.get('discount')
            due_date = validated_data.get('due_date')
            package_name = validated_data.get('package_name', '')
            invoice_no = validated_data.get('invoice_no', '')
            package_amount = validated_data.get('package_amount')
            total_payable = validated_data.get('total_payable')
            actor = 'system'
            request = self.context.get('request')
            if request and getattr(request, 'user', None):
                actor = request.user.username

            return create_invoice_with_lines(
                tenant=tenant,
                customer=customer,
                lines_data=lines_data,
                billing_month=validated_data.get('billing_month', ''),
                due_date=due_date,
                discount=discount,
                package_name=package_name,
                invoice_no=invoice_no,
                package_amount=package_amount,
                total_payable=total_payable,
                actor_username=actor
            )
        return super().create(validated_data)


class RechargeSerializer(serializers.ModelSerializer):
    """
    Recharge serializer with cross-FK tenant ownership validation (Plan Phase 7).
    Validates:
      - recharge.customer.tenant == request.tenant
      - recharge.package.tenant  == request.tenant (when provided)
    """
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_username = serializers.CharField(source='customer.pppoe_username', read_only=True)
    package_name = serializers.CharField(source='package.name', read_only=True)
    processed_by_name = serializers.CharField(source='processed_by.user.username', read_only=True)

    class Meta:
        model = Recharge
        fields = '__all__'
        read_only_fields = ('tenant',)

    def validate_customer(self, customer):
        tenant = _tenant_from_context(self.context)
        if tenant and customer.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Customer does not belong to your ISP."
            )
        return customer

    def validate_package(self, package):
        if package is None:
            return package
        tenant = _tenant_from_context(self.context)
        if tenant and package.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Package does not belong to your ISP. Cross-tenant recharge is not allowed."
            )
        return package


class OfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offer
        fields = '__all__'
        read_only_fields = ('tenant',)
