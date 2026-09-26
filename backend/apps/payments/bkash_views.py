"""
bKash Tokenized Checkout, PayBill Biller API, and Manual Forwarder Webhook Views.
Complies with bKash Developer Specs (https://developer.bka.sh/docs/product-overview).
"""

import json
import logging
import uuid
from decimal import Decimal
from django.db import models, transaction, IntegrityError
from django.utils import timezone
from rest_framework import views, status, permissions, parsers
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from apps.core.utils import get_tenant_for_request
from apps.core.encryption import constant_time_compare
from apps.customers.models import Customer, CustomerStatus
from apps.customers.authentication import CustomerJWTAuthentication
from apps.billing.models import Package, Invoice, Recharge
from apps.finance.models import BillingAccount, LedgerEntry
from apps.finance.services import get_or_create_billing_account, record_ledger_entry, allocate_payment_to_invoices
from apps.payments.models import (
    PaymentGateway, GatewayProvider, PaymentTransaction, TransactionStatus,
    PaymentAttempt, PaymentAttemptStatus, InboundPaymentEvent
)
from apps.payments.services.bkash import BKashService
from apps.payments.security import (
    validate_webhook_tenant,
    validate_webhook_signature,
    validate_webhook_timestamp_and_replay,
    validate_currency,
    validate_amount,
    validate_customer_and_invoice_mapping,
    sanitize_payload,
)
from apps.network.models import NetworkSyncJob
from apps.network.tasks import dispatch_network_sync_job

logger = logging.getLogger(__name__)


def _settle_customer_payment(tenant, customer, amount: Decimal, trx_id: str, payment_method: str = "bKash", gateway=None, raw_payload=None):
    """
    Unified transactional helper to:
    1. Create PaymentTransaction
    2. Update BillingAccount & LedgerEntry
    3. Allocate to unpaid Invoices (FIFO)
    4. Offset due_amount & advance_amount
    5. Extend expiry_date and restore connection if expired
    6. Record Recharge entry
    7. Dispatch network sync job (ENABLE_USER)
    """
    sanitized_payload = sanitize_payload(raw_payload) if raw_payload else {}
    try:
        with transaction.atomic():
            # Check idempotency
            existing_txn = PaymentTransaction.objects.filter(tenant=tenant, trx_id=trx_id).first()
            if existing_txn:
                return existing_txn, False

            # Lock Customer first, then BillingAccount (canonical lock hierarchy)
            locked_cust = Customer.objects.select_for_update().get(id=customer.id)

            txn = PaymentTransaction.objects.create(
                tenant=tenant,
                customer=locked_cust,
                gateway=gateway,
                amount=amount,
                trx_id=trx_id,
                payment_method=payment_method,
                status=TransactionStatus.SUCCESS,
                customer_account=locked_cust.mobile,
                raw_payload=sanitized_payload
            )

            # Financial ledger & billing account
            billing_acct = get_or_create_billing_account(tenant, locked_cust)
            billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)
            billing_acct.total_paid = Decimal(str(billing_acct.total_paid or '0.00')) + amount
            billing_acct.balance = Decimal(str(billing_acct.balance or '0.00')) + amount
            billing_acct.last_payment_at = timezone.now()
            billing_acct.save(update_fields=['total_paid', 'balance', 'last_payment_at'])

            record_ledger_entry(
                tenant=tenant,
                customer=locked_cust,
                entry_type=LedgerEntry.EntryType.PAYMENT,
                amount=amount,
                balance_after=billing_acct.balance,
                reference_id=str(txn.id),
                reference_type='PaymentTransaction',
                description=f"Online Payment via {payment_method} (TrxID: {trx_id})",
                created_by='system'
            )

            allocate_payment_to_invoices(
                tenant=tenant,
                payment=txn,
                customer=locked_cust,
                amount=amount,
                notes=f"Auto allocation from {payment_method} {trx_id}"
            )

            # Update customer balance & expiry
            due_dec = Decimal(str(locked_cust.due_amount or '0.00'))
            adv_dec = Decimal(str(locked_cust.advance_amount or '0.00'))

            if due_dec > 0:
                if amount >= due_dec:
                    surplus = amount - due_dec
                    locked_cust.due_amount = Decimal('0.00')
                    locked_cust.advance_amount = adv_dec + surplus
                else:
                    locked_cust.due_amount = due_dec - amount
            else:
                locked_cust.advance_amount = adv_dec + amount

            # Extend expiry if needed
            validity = locked_cust.package.validity_days if locked_cust.package else 30
            today = timezone.localdate()
            old_expiry = locked_cust.expiry_date
            if not old_expiry or old_expiry < today:
                new_expiry = today + timezone.timedelta(days=validity)
            else:
                new_expiry = old_expiry + timezone.timedelta(days=validity)

            locked_cust.expiry_date = new_expiry
            if locked_cust.status != CustomerStatus.ACTIVE:
                locked_cust.status = CustomerStatus.ACTIVE

            locked_cust.save(update_fields=['due_amount', 'advance_amount', 'expiry_date', 'status'])

            # Recharge record
            Recharge.objects.create(
                tenant=tenant,
                customer=locked_cust,
                package=locked_cust.package,
                amount=amount,
                validity_days=validity,
                old_expiry=old_expiry,
                new_expiry=new_expiry,
                payment_method=payment_method,
                trx_id=trx_id,
                notes=f"Auto-recharged via {payment_method} online payment"
            )

            # Dispatch network sync job to unblock / enable user
            if locked_cust.router:
                dispatch_network_sync_job(
                    tenant=tenant,
                    action=NetworkSyncJob.Action.ENABLE_USER,
                    customer=locked_cust,
                    router=locked_cust.router,
                    payload={'pppoe_username': locked_cust.pppoe_username, 'reason': 'PAYMENT_SUCCESS'}
                )

            return txn, True
    except IntegrityError:
        existing_txn = PaymentTransaction.objects.filter(tenant=tenant, trx_id=trx_id).first()
        if existing_txn:
            return existing_txn, False
        raise


def _settle_reseller_payment(tenant, reseller, amount: Decimal, trx_id: str, payment_method: str = "bKash", gateway=None, raw_payload=None):
    from apps.authentication.models import ResellerLedgerEntry
    sanitized_payload = sanitize_payload(raw_payload) if raw_payload else {}
    try:
        with transaction.atomic():
            existing_txn = PaymentTransaction.objects.filter(tenant=tenant, trx_id=trx_id).first()
            if existing_txn:
                return existing_txn, False

            from apps.authentication.models import Reseller
            locked_reseller = Reseller.objects.select_for_update().get(id=reseller.id)

            txn = PaymentTransaction.objects.create(
                tenant=tenant,
                reseller=locked_reseller,
                entity_type=PaymentTransaction.EntityType.RESELLER,
                gateway=gateway,
                amount=amount,
                trx_id=trx_id,
                payment_method=payment_method,
                status=TransactionStatus.SUCCESS,
                customer_account=locked_reseller.contact_phone or locked_reseller.user.username,
                raw_payload=sanitized_payload
            )

            locked_reseller.wallet_balance = Decimal(str(locked_reseller.wallet_balance or '0.00')) + amount
            locked_reseller.save(update_fields=['wallet_balance'])

            ResellerLedgerEntry.objects.create(
                tenant=tenant,
                reseller=locked_reseller,
                entry_type=ResellerLedgerEntry.EntryType.CREDIT,
                amount=amount,
                balance_after=locked_reseller.wallet_balance,
                reference=trx_id,
                notes=f"Wallet top-up via {payment_method}"
            )

            return txn, True
    except IntegrityError:
        existing_txn = PaymentTransaction.objects.filter(tenant=tenant, trx_id=trx_id).first()
        if existing_txn:
            return existing_txn, False
        raise


class BKashCheckoutCreateView(views.APIView):
    """
    Initiates bKash Tokenized Checkout for authenticated customers.
    POST /api/v1/portal/payments/bkash/create/ or /api/v1/payments/bkash/checkout/create/
    """
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        customer = getattr(request.user, 'customer', None)
        if not customer:
            return Response({"error": "Customer context required."}, status=status.HTTP_404_NOT_FOUND)

        tenant = customer.tenant
        gateway = PaymentGateway.objects.filter(
            tenant=tenant,
            provider=GatewayProvider.BKASH,
            is_active=True
        ).first()

        if not gateway:
            # Fallback to create/use default sandbox config for tenant
            gateway, _ = PaymentGateway.objects.get_or_create(
                tenant=tenant,
                provider=GatewayProvider.BKASH,
                defaults={
                    'title': 'bKash Merchant Checkout',
                    'is_sandbox': True,
                    'app_key': 'sandbox_default_key',
                    'app_secret': 'sandbox_default_secret',
                    'username': 'sandbox_user',
                    'password': 'sandbox_pass'
                }
            )

        raw_amount = request.data.get('amount')
        if raw_amount:
            try:
                amount = Decimal(str(raw_amount))
            except Exception:
                return Response({"error": "Invalid amount format."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            amount = customer.due_amount if customer.due_amount > 0 else customer.monthly_bill

        if amount <= Decimal('0.00'):
            return Response({"error": "Payment amount must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)

        invoice_no = request.data.get('invoice_no') or f"INV-{customer.customer_code or customer.pppoe_username}-{timezone.now().strftime('%m%d%H%M')}"
        callback_url = request.data.get('callback_url') or f"https://{request.get_host()}/portal"

        service = BKashService(gateway)
        result = service.create_payment(
            amount=amount,
            invoice_number=invoice_no,
            payer_reference=customer.customer_code or customer.pppoe_username,
            callback_url=callback_url
        )

        payment_id = result.get("paymentID") or ""
        # Record payment attempt
        attempt = PaymentAttempt.objects.create(
            tenant=tenant,
            customer=customer,
            gateway=gateway,
            amount=amount,
            provider=GatewayProvider.BKASH,
            status=PaymentAttemptStatus.INITIATED,
            idempotency_key=payment_id,
            provider_reference=invoice_no,
            raw_request={'invoice_no': invoice_no, 'callback_url': callback_url},
            raw_response=result
        )

        return Response({
            "success": True,
            "payment_id": payment_id,
            "bkash_url": result.get("bkashURL"),
            "amount": str(amount),
            "invoice_no": invoice_no,
            "attempt_id": str(attempt.id)
        }, status=status.HTTP_200_OK)


class BKashCheckoutExecuteView(views.APIView):
    """
    Executes bKash Tokenized Checkout after customer confirmation.
    POST /api/v1/portal/payments/bkash/execute/ or /api/v1/payments/bkash/checkout/execute/
    """
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        customer = getattr(request.user, 'customer', None)
        if not customer:
            return Response({"error": "Customer context required."}, status=status.HTTP_404_NOT_FOUND)

        payment_id = request.data.get('payment_id') or request.data.get('paymentID')
        if not payment_id:
            return Response({"error": "payment_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        tenant = customer.tenant
        gateway = PaymentGateway.objects.filter(
            tenant=tenant,
            provider=GatewayProvider.BKASH
        ).first()

        if not gateway:
            return Response({"error": "bKash gateway not configured for this tenant."}, status=status.HTTP_400_BAD_REQUEST)

        # Lookup attempt to get exact initiated amount
        attempt = PaymentAttempt.objects.filter(
            tenant=tenant,
            customer=customer,
            idempotency_key=payment_id
        ).first()

        service = BKashService(gateway)
        exec_result = service.execute_payment(payment_id)

        trx_id = exec_result.get('trxID')
        status_msg = exec_result.get('transactionStatus') or exec_result.get('statusMessage')

        if not trx_id or status_msg not in ['Completed', 'Successful']:
            if attempt:
                attempt.status = PaymentAttemptStatus.FAILED
                attempt.failure_reason = str(exec_result)
                attempt.save(update_fields=['status', 'failure_reason'])
            return Response({
                "success": False,
                "error": exec_result.get("statusMessage", "bKash transaction execution failed."),
                "details": exec_result
            }, status=status.HTTP_400_BAD_REQUEST)

        # Provider currency validation
        exec_curr = exec_result.get('currency') or 'BDT'
        valid_curr, curr_err = validate_currency(exec_curr)
        if not valid_curr:
            return curr_err

        # Provider amount validation against initiated attempt
        if attempt:
            amount = attempt.amount
            if exec_result.get('amount'):
                try:
                    exec_amount = Decimal(str(exec_result['amount']))
                    if exec_amount != attempt.amount:
                        logger.warning("bKash execute amount mismatch: attempt=%s, exec=%s", attempt.amount, exec_amount)
                        return Response({
                            "success": False,
                            "error": f"Payment amount mismatch: initiated {attempt.amount} but provider executed {exec_amount}."
                        }, status=status.HTTP_400_BAD_REQUEST)
                except Exception:
                    pass
        else:
            amount = Decimal(str(exec_result.get('amount', customer.monthly_bill)))

        txn, created = _settle_customer_payment(
            tenant=tenant,
            customer=customer,
            amount=amount,
            trx_id=trx_id,
            payment_method="bKash",
            gateway=gateway,
            raw_payload=sanitize_payload(exec_result)
        )

        if attempt:
            attempt.status = PaymentAttemptStatus.SUCCESS
            attempt.transaction = txn
            attempt.completed_at = timezone.now()
            attempt.save(update_fields=['status', 'transaction', 'completed_at'])

        return Response({
            "success": True,
            "message": "bKash payment executed and account recharged successfully.",
            "trx_id": trx_id,
            "amount": str(amount),
            "status": "Completed",
            "new_expiry": customer.expiry_date
        }, status=status.HTTP_200_OK)


def _authenticate_bkash_biller(request):
    """
    Authenticate bKash Outbound API caller credentials against active PaymentGateway.
    Handles both domain-resolved tenant and multi-tenant credential matching.
    Returns: (tenant, gateway, error_code, error_msg)
    """
    username = (
        request.data.get('UserName') or
        request.data.get('username') or
        ''
    )
    if isinstance(username, str):
        username = username.strip().strip('"\'')

    password = (
        request.data.get('Password') or
        request.data.get('password') or
        ''
    )
    if isinstance(password, str):
        password = password.strip().strip('"\'')

    if not username or not password:
        return None, None, "406", "Mandatory Field missing"

    # Try tenant resolved by domain middleware
    tenant = get_tenant_for_request(request)
    if tenant:
        gateways = PaymentGateway.objects.filter(
            tenant=tenant,
            provider=GatewayProvider.BKASH,
            is_active=True
        )
        for gw in gateways:
            if (gw.username and gw.username == username and gw.password and constant_time_compare(gw.password, password)) or \
               (gw.sandbox_username and gw.sandbox_username == username and gw.sandbox_password and constant_time_compare(gw.sandbox_password, password)):
                return tenant, gw, None, None
        return None, None, "403", "Authentication failed"

    # Fallback: Find matching tenant across active bKash gateways
    gateways = PaymentGateway.objects.filter(
        provider=GatewayProvider.BKASH,
        is_active=True
    ).select_related('tenant')
    for gw in gateways:
        if (gw.username and gw.username == username and gw.password and constant_time_compare(gw.password, password)) or \
           (gw.sandbox_username and gw.sandbox_username == username and gw.sandbox_password and constant_time_compare(gw.sandbox_password, password)):
            return gw.tenant, gw, None, None

    return None, None, "403", "Authentication failed"


def _extract_customer_no(request_data):
    """
    Extracts customer reference identifier according to bKash Outbound Specification:
    AccNo / MeterNo / CustomerNo / BillNo / RefID
    """
    val = (
        request_data.get('CustomerNo') or
        request_data.get('AccNo') or
        request_data.get('MeterNo') or
        request_data.get('BillNo') or
        request_data.get('RefID') or
        request_data.get('account_no') or
        request_data.get('subscriber_id') or
        request_data.get('customer_no') or
        request_data.get('acc_no') or
        ''
    )
    if isinstance(val, str):
        val = val.strip().strip('"\'')
    return val


class BKashPayBillQueryView(views.APIView):
    """
    Official bKash PayBill Biller Query API (v1.4 Section 1.1).
    bKash Middleware calls this to validate subscriber account and get outstanding bill.
    POST /api/queryBill/ or /api/v1/payments/bkash/paybill/query/
    """
    permission_classes = [permissions.AllowAny]
    parser_classes = [parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser]

    def post(self, request, *args, **kwargs):
        # 1. Mandatory parameter checks
        customer_no = _extract_customer_no(request.data)
        username = request.data.get('UserName') or request.data.get('username')
        password = request.data.get('Password') or request.data.get('password')

        if not customer_no or not username or not password:
            return Response({
                "ErrorCode": "406",
                "ErrorMsg": "Mandatory Field missing",
                "status": "406",
                "message": "Mandatory Field missing"
            }, status=status.HTTP_200_OK)

        # 2. Authentication
        tenant, gateway, err_code, err_msg = _authenticate_bkash_biller(request)
        if err_code:
            return Response({
                "ErrorCode": err_code,
                "ErrorMsg": err_msg,
                "status": err_code,
                "message": err_msg
            }, status=status.HTTP_200_OK)

        # Cross-tenant check
        if request.data.get('tenant_id'):
            if str(request.data.get('tenant_id')).strip().lower() != str(tenant.id).strip().lower():
                return Response({
                    "ErrorCode": "403",
                    "ErrorMsg": "Cross-tenant access prohibited",
                    "status": "403",
                    "message": "Cross-tenant access prohibited"
                }, status=status.HTTP_200_OK)

        # 3. Lookup customer by customer_code, pppoe_username, or mobile
        customer = Customer.objects.filter(
            tenant=tenant
        ).filter(
            models.Q(customer_code=customer_no) |
            models.Q(pppoe_username=customer_no) |
            models.Q(mobile=customer_no)
        ).select_related('package', 'router').first()

        if not customer:
            return Response({
                "ErrorCode": "404",
                "ErrorMsg": "Data not found",
                "status": "404",
                "message": "Data not found"
            }, status=status.HTTP_200_OK)

        bill_month_req = request.data.get('BillMonth') or request.data.get('bill_month') or ''
        if isinstance(bill_month_req, str):
            bill_month_req = bill_month_req.strip().strip('"\'')

        bill_month_str = bill_month_req if bill_month_req else timezone.now().strftime("%m%Y")
        query_time_str = timezone.now().strftime("%Y%m%d%H%M%S")

        # 4. Check outstanding bill / invoices
        unpaid_invoice = Invoice.objects.filter(
            tenant=tenant,
            customer=customer,
            status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL]
        ).order_by('created_at').first()

        due_date_str = ""
        if unpaid_invoice:
            bill_amount = unpaid_invoice.due_amount
            if unpaid_invoice.due_date:
                due_date_str = unpaid_invoice.due_date.strftime("%Y%m%d")
        elif customer.due_amount > Decimal('0.00'):
            bill_amount = customer.due_amount
            if customer.expiry_date:
                due_date_str = customer.expiry_date.strftime("%Y%m%d")
        elif customer.status == CustomerStatus.EXPIRED or (customer.expiry_date and customer.expiry_date <= timezone.localdate()):
            bill_amount = customer.monthly_bill or (customer.package.regular_price if customer.package else Decimal('0.00'))
            if customer.expiry_date:
                due_date_str = customer.expiry_date.strftime("%Y%m%d")
        else:
            # Customer is active with no outstanding dues: Bill already paid
            return Response({
                "ErrorCode": "436",
                "ErrorMsg": "Already paid",
                "ConsumerName": customer.full_name,
                "BillMonth": bill_month_str,
                "BillAmount": "0.00",
                "QueryTime": query_time_str,
                "status": "436",
                "message": "Already paid"
            }, status=status.HTTP_200_OK)

        return Response({
            "ErrorCode": "200",
            "ErrorMsg": "Successful",
            "ConsumerName": customer.full_name,
            "BillMonth": bill_month_str,
            "BillAmount": f"{bill_amount:.2f}",
            "BillDueDate(YYYYMMDD)": due_date_str,
            "BillDueDate": due_date_str,
            "QueryTime": query_time_str,
            "Amount Breakdown(if available)": f"{{Package Cost: {bill_amount:.2f}}}",
            # Backward compatibility fields
            "status": "0000",
            "message": "Success",
            "account_no": customer.customer_code or customer.pppoe_username,
            "customer_name": customer.full_name,
            "amount_due": f"{bill_amount:.2f}",
            "min_amount": "10.00",
            "max_amount": "50000.00",
            "currency": "BDT"
        }, status=status.HTTP_200_OK)


class BKashPayBillPayView(views.APIView):
    """
    Official bKash PayBill Biller Payment Settlement API (v1.4 Section 1.2).
    bKash Middleware calls this when a customer pays their ISP bill through bKash.
    POST /api/payBill/ or /api/v1/payments/bkash/paybill/pay/
    """
    permission_classes = [permissions.AllowAny]
    parser_classes = [parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser]

    def post(self, request, *args, **kwargs):
        # 1. Mandatory parameter checks
        customer_no = _extract_customer_no(request.data)
        username = request.data.get('UserName') or request.data.get('username')
        password = request.data.get('Password') or request.data.get('password')
        trx_id = (
            request.data.get('TrxId') or
            request.data.get('trx_id') or
            request.data.get('transaction_id') or
            ''
        )
        if isinstance(trx_id, str):
            trx_id = trx_id.strip().strip('"\'')

        raw_amount = request.data.get('Amount') or request.data.get('amount')

        if not customer_no or not username or not password or not trx_id or raw_amount is None:
            return Response({
                "ErrorCode": "406",
                "ErrorMsg": "Mandatory Field missing",
                "status": "406",
                "message": "Mandatory Field missing"
            }, status=status.HTTP_200_OK)

        # 2. Authentication
        tenant, gateway, err_code, err_msg = _authenticate_bkash_biller(request)
        if err_code:
            return Response({
                "ErrorCode": err_code,
                "ErrorMsg": err_msg,
                "status": err_code,
                "message": err_msg
            }, status=status.HTTP_200_OK)

        # Cross-tenant check
        if request.data.get('tenant_id'):
            if str(request.data.get('tenant_id')).strip().lower() != str(tenant.id).strip().lower():
                return Response({
                    "ErrorCode": "403",
                    "ErrorMsg": "Cross-tenant access prohibited",
                    "status": "403",
                    "message": "Cross-tenant access prohibited"
                }, status=status.HTTP_200_OK)

        # Currency validation
        valid_curr, curr_err = validate_currency(request.data.get('currency'))
        if not valid_curr:
            return Response({
                "ErrorCode": "435",
                "ErrorMsg": "Data Mismatch - Unsupported currency",
                "status": "435",
                "message": "Data Mismatch"
            }, status=status.HTTP_200_OK)

        # Timestamp and replay validation
        valid_ts, ts_err = validate_webhook_timestamp_and_replay(request, tenant, trx_id=trx_id)
        if not valid_ts:
            return Response({
                "ErrorCode": "409",
                "ErrorMsg": "Replay detected or timestamp expired",
                "status": "409",
                "message": "Replay detected"
            }, status=status.HTTP_200_OK)

        # 3. Validate Amount
        try:
            amount = Decimal(str(raw_amount).strip().strip('"\''))
            if amount <= Decimal('0.00'):
                return Response({
                    "ErrorCode": "438",
                    "ErrorMsg": "Minimum amount not paid",
                    "status": "438",
                    "message": "Minimum amount not paid"
                }, status=status.HTTP_200_OK)
            if amount < Decimal('10.00'):
                return Response({
                    "ErrorCode": "438",
                    "ErrorMsg": "Minimum amount not paid",
                    "status": "438",
                    "message": "Minimum amount not paid"
                }, status=status.HTTP_200_OK)
        except Exception:
            return Response({
                "ErrorCode": "435",
                "ErrorMsg": "Data Mismatch",
                "status": "435",
                "message": "Data Mismatch"
            }, status=status.HTTP_200_OK)

        # 4. Customer Lookup
        customer = Customer.objects.filter(
            tenant=tenant
        ).filter(
            models.Q(customer_code=customer_no) |
            models.Q(pppoe_username=customer_no) |
            models.Q(mobile=customer_no)
        ).select_related('package', 'router').first()

        if not customer:
            return Response({
                "ErrorCode": "404",
                "ErrorMsg": "Data not found",
                "status": "404",
                "message": "Data not found"
            }, status=status.HTTP_200_OK)

        # Customer & Invoice mapping validation
        cust_id_req = request.data.get('customer_id')
        inv_no_req = request.data.get('BillNo') or request.data.get('invoice_id')
        if cust_id_req or inv_no_req:
            v_cust, v_inv, map_err = validate_customer_and_invoice_mapping(
                tenant, customer_id=cust_id_req, customer_no=customer_no,
                invoice_id=inv_no_req, amount=amount
            )
            if map_err:
                return Response({
                    "ErrorCode": "435",
                    "ErrorMsg": "Data Mismatch - Invalid mapping",
                    "status": "435",
                    "message": "Data Mismatch"
                }, status=status.HTTP_200_OK)

        # 5. Idempotency check: duplicate bKash TrxId
        existing_txn = PaymentTransaction.objects.filter(tenant=tenant, trx_id=trx_id).first()
        if existing_txn:
            return Response({
                "ErrorCode": "200",
                "ErrorMsg": "Successful",
                "ConsumerName": existing_txn.customer.full_name,
                "TotalAmount": f"{existing_txn.amount:.2f}",
                "TrxId": existing_txn.trx_id,
                "MiddlewarePayTime": existing_txn.created_at.strftime("%Y%m%d%H%M%S"),
                "RefNumber": str(existing_txn.id),
                "CustomMessage": "Payment already processed",
                "Amount Breakdown(if available)": f"{{Paid: {existing_txn.amount:.2f}}}",
                "status": "0000",
                "message": "Payment already processed",
                "trx_id": trx_id,
                "account_no": customer_no
            }, status=status.HTTP_200_OK)

        # 6. Settle Customer Payment
        txn, created = _settle_customer_payment(
            tenant=tenant,
            customer=customer,
            amount=amount,
            trx_id=trx_id,
            payment_method="bKash PayBill",
            gateway=gateway,
            raw_payload=sanitize_payload(request.data)
        )

        customer.refresh_from_db()
        pay_time_str = timezone.now().strftime("%Y%m%d%H%M%S")

        return Response({
            "ErrorCode": "200",
            "ErrorMsg": "Successful",
            "ConsumerName": customer.full_name,
            "TotalAmount": f"{amount:.2f}",
            "TrxId": trx_id,
            "MiddlewarePayTime": pay_time_str,
            "RefNumber": str(txn.id),
            "CustomMessage": f"Account {customer.customer_code or customer.pppoe_username} recharged successfully",
            "Amount Breakdown(if available)": f"{{Paid: {amount:.2f}}}",
            "status": "0000",
            "message": "Bill payment processed successfully",
            "trx_id": trx_id,
            "account_no": customer.customer_code or customer.pppoe_username,
            "paid_amount": f"{amount:.2f}",
            "new_expiry": customer.expiry_date
        }, status=status.HTTP_200_OK)


class BKashPayBillSearchView(views.APIView):
    """
    Official bKash PayBill Transaction Search Query API (v1.4 Section 1.3).
    bKash Middleware calls this to check whether a transaction was successful at the biller.
    POST /api/searchTransaction/ or /api/v1/payments/bkash/paybill/search/
    """
    permission_classes = [permissions.AllowAny]
    parser_classes = [parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser]

    def post(self, request, *args, **kwargs):
        username = request.data.get('UserName') or request.data.get('username')
        password = request.data.get('Password') or request.data.get('password')
        trx_id = (
            request.data.get('TrxId') or
            request.data.get('trx_id') or
            request.data.get('transaction_id') or
            ''
        )
        if isinstance(trx_id, str):
            trx_id = trx_id.strip().strip('"\'')

        if not trx_id or not username or not password:
            return Response({
                "ErrorCode": "406",
                "ErrorMsg": "Mandatory Field missing",
                "status": "406",
                "message": "Mandatory Field missing"
            }, status=status.HTTP_200_OK)

        tenant, gateway, err_code, err_msg = _authenticate_bkash_biller(request)
        if err_code:
            return Response({
                "ErrorCode": err_code,
                "ErrorMsg": err_msg,
                "status": err_code,
                "message": err_msg
            }, status=status.HTTP_200_OK)

        # Cross-tenant check
        if request.data.get('tenant_id'):
            if str(request.data.get('tenant_id')).strip().lower() != str(tenant.id).strip().lower():
                return Response({
                    "ErrorCode": "403",
                    "ErrorMsg": "Cross-tenant access prohibited",
                    "status": "403",
                    "message": "Cross-tenant access prohibited"
                }, status=status.HTTP_200_OK)

        txn = PaymentTransaction.objects.filter(
            tenant=tenant,
            trx_id=trx_id
        ).select_related('customer').first()

        if not txn:
            return Response({
                "ErrorCode": "404",
                "ErrorMsg": "Data not found",
                "status": "404",
                "message": "Data not found"
            }, status=status.HTTP_200_OK)

        return Response({
            "ErrorCode": "200",
            "ErrorMsg": "Successful",
            "TotalAmount": f"{txn.amount:.2f}",
            "TrxId": txn.trx_id,
            "MiddlewarePayTime": txn.created_at.strftime("%Y%m%d%H%M%S"),
            "RefNumber": str(txn.id),
            "CustomMessage": f"Customer: {txn.customer.full_name} ({txn.customer.customer_code or txn.customer.pppoe_username})",
            "Amount Breakdown(if available)": f"{{Paid: {txn.amount:.2f}}}",
            "status": "0000",
            "message": "Transaction found"
        }, status=status.HTTP_200_OK)


class ManualSMSForwarderView(views.APIView):
    """
    Webhook for Android SMS / Notification Forwarder app.
    Designed for ISP tenants without a bKash merchant account.
    POST /api/v1/payments/forwarder/webhook/

    Payload:
    {
      "sender_account": "01711223344",
      "reference_id": "CUST-101",
      "amount": 800.00,
      "trx_id": "9H82JKS10A",
      "provider": "bKash"
    }
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        # Resolve tenant strictly from request domain/header, rejecting cross-tenant attempts
        tenant, err_resp = validate_webhook_tenant(request)
        if err_resp:
            return err_resp

        # Signature validation
        valid_sig, sig_err = validate_webhook_signature(request, tenant)
        if not valid_sig:
            return sig_err

        # Currency validation
        valid_curr, curr_err = validate_currency(request.data.get('currency'))
        if not valid_curr:
            return curr_err

        sender_account = str(request.data.get('sender_account') or request.data.get('phone_number') or '').strip()
        reference_id = str(request.data.get('reference_id') or request.data.get('ref') or '').strip()
        trx_id = str(request.data.get('trx_id') or '').strip()
        provider = str(request.data.get('provider') or 'bKash').strip()

        raw_amount = request.data.get('amount')
        if raw_amount is not None:
            amt, amt_err = validate_amount(raw_amount, min_amount=Decimal('0.01'))
            if amt_err:
                return amt_err
            amount = amt
        else:
            amount = Decimal('0.00')

        if not trx_id:
            return Response({"error": "trx_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Timestamp and replay validation
        valid_ts, ts_err = validate_webhook_timestamp_and_replay(request, tenant, trx_id=trx_id)
        if not valid_ts:
            return ts_err

        # Idempotency
        if PaymentTransaction.objects.filter(tenant=tenant, trx_id=trx_id).exists():
            return Response({
                "status": "accepted",
                "idempotent": True,
                "message": f"TrxID {trx_id} has already been processed."
            }, status=status.HTTP_200_OK)

        # Check for customer match by reference_id, customer_id, or sender_account
        customer = None
        cust_id_req = request.data.get('customer_id')
        inv_id_req = request.data.get('invoice_id')
        if cust_id_req or inv_id_req:
            v_cust, v_inv, map_err = validate_customer_and_invoice_mapping(
                tenant, customer_id=cust_id_req, invoice_id=inv_id_req,
                amount=amount if amount > Decimal('0.00') else None
            )
            if map_err:
                return map_err
            if v_cust:
                customer = v_cust

        if not customer and reference_id:
            customer = Customer.objects.filter(
                tenant=tenant
            ).filter(
                models.Q(customer_code__iexact=reference_id) |
                models.Q(pppoe_username__iexact=reference_id)
            ).first()

        if not customer and sender_account:
            customer = Customer.objects.filter(
                tenant=tenant,
                mobile=sender_account
            ).first()

        sanitized_payload = sanitize_payload(request.data)

        if customer and amount > Decimal('0.00'):
            # Instant automated match & line restoration!
            txn, _ = _settle_customer_payment(
                tenant=tenant,
                customer=customer,
                amount=amount,
                trx_id=trx_id,
                payment_method=f"Manual {provider} Forwarder",
                raw_payload=sanitized_payload
            )
            return Response({
                "status": "matched",
                "matched": True,
                "customer_code": customer.customer_code,
                "customer_name": customer.full_name,
                "amount": str(amount),
                "trx_id": trx_id,
                "message": "Payment matched and customer line recharged successfully."
            }, status=status.HTTP_200_OK)
            
        # Partner Wallet Top-up Matching
        if not customer and amount > Decimal('0.00'):
            from apps.authentication.models import Reseller
            reseller = None
            if reference_id:
                reseller = Reseller.objects.filter(tenant=tenant).filter(
                    models.Q(user__username__iexact=reference_id) |
                    models.Q(contact_phone=reference_id)
                ).first()
            if not reseller and sender_account:
                reseller = Reseller.objects.filter(tenant=tenant, contact_phone=sender_account).first()
                
            if reseller:
                txn, _ = _settle_reseller_payment(
                    tenant=tenant,
                    reseller=reseller,
                    amount=amount,
                    trx_id=trx_id,
                    payment_method=f"Manual {provider} Forwarder",
                    raw_payload=sanitized_payload
                )
                return Response({
                    "status": "matched",
                    "matched": True,
                    "customer_name": reseller.user.username,
                    "amount": str(amount),
                    "trx_id": trx_id,
                    "message": "Payment matched and partner wallet recharged successfully."
                }, status=status.HTTP_200_OK)

        # Store as unmatched InboundPaymentEvent for manual resolution or customer claim
        event = InboundPaymentEvent.objects.create(
            tenant=tenant,
            source=InboundPaymentEvent.EventSource.SMS,
            raw_payload=json.dumps(sanitized_payload, ensure_ascii=False) if isinstance(sanitized_payload, dict) else str(sanitized_payload),
            provider=provider,
            amount=amount if amount > 0 else None,
            trx_id=trx_id,
            sender_account=sender_account,
            reference_id=reference_id,
            status=InboundPaymentEvent.EventStatus.UNMATCHED
        )
        return Response({
            "status": "unmatched",
            "matched": False,
            "event_id": str(event.id),
            "message": "Payment recorded as unmatched. Waiting for customer claim or staff review."
        }, status=status.HTTP_202_ACCEPTED)


class CustomerPortalClaimPaymentView(views.APIView):
    """
    Customer portal endpoint allowing a customer to claim an unmatched manual MFS payment.
    POST /api/v1/portal/payments/claim/
    Payload: {"trx_id": "9H82JKS10A"}
    """
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        customer = getattr(request.user, 'customer', None)
        if not customer:
            return Response({"error": "Customer context required."}, status=status.HTTP_404_NOT_FOUND)

        tenant = customer.tenant
        trx_id = str(request.data.get('trx_id') or '').strip()
        if not trx_id:
            return Response({"error": "trx_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Check if already processed
        if PaymentTransaction.objects.filter(tenant=tenant, trx_id=trx_id).exists():
            return Response({
                "success": True,
                "message": f"Transaction {trx_id} is already approved and credited to your account."
            }, status=status.HTTP_200_OK)

        # Find unmatched InboundPaymentEvent
        event = InboundPaymentEvent.objects.filter(
            tenant=tenant,
            trx_id=trx_id,
            status=InboundPaymentEvent.EventStatus.UNMATCHED
        ).first()

        if not event or not event.amount:
            return Response({
                "success": False,
                "error": f"No pending payment found with TrxID {trx_id}. Please double check the ID or contact support."
            }, status=status.HTTP_404_NOT_FOUND)

        # Match and settle
        txn, _ = _settle_customer_payment(
            tenant=tenant,
            customer=customer,
            amount=event.amount,
            trx_id=trx_id,
            payment_method=f"Claimed {event.provider or 'MFS'}",
            raw_payload={"event_id": str(event.id)}
        )

        event.status = InboundPaymentEvent.EventStatus.MATCHED
        event.matched_customer = customer
        event.matched_transaction = txn
        event.processed_at = timezone.now()
        event.save(update_fields=['status', 'matched_customer', 'matched_transaction', 'processed_at'])

        return Response({
            "success": True,
            "message": f"Payment of ৳{event.amount} successfully claimed and credited to your account.",
            "trx_id": trx_id,
            "amount": str(event.amount),
            "new_expiry": customer.expiry_date
        }, status=status.HTTP_200_OK)


class CheckoutStatusView(views.APIView):
    """
    Polling endpoint with MFS catch-up matching by username reference first, then payer mobile.
    GET /api/v1/payments/checkout-status/ (Read-only polling)
    POST /api/v1/payments/checkout-status/ (Authorized settlement)
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_entity_for_user(self, user, tenant):
        """
        Derives the entity (Customer or Reseller) strictly from request.user.
        """
        customer = getattr(user, 'customer', None)
        if not customer:
            customer = Customer.objects.filter(user=user, tenant=tenant).first()
        if customer:
            return 'customer', customer

        from apps.authentication.models import Reseller
        reseller = getattr(user, 'reseller_profile', None)
        if not reseller:
            reseller = Reseller.objects.filter(user=user, tenant=tenant).first()
        if reseller:
            return 'reseller', reseller

        if user.is_staff or user.is_superuser:
            return 'staff', user

        return None, None

    def get(self, request, *args, **kwargs):
        tenant = get_tenant_for_request(request)
        reference = (request.query_params.get('reference') or '').strip()
        amount_str = request.query_params.get('amount')

        if not reference:
            return Response({"error": "reference required"}, status=400)

        amount = None
        if amount_str:
            try:
                amount = Decimal(str(amount_str))
            except Exception:
                pass

        # Check if already processed for this specific checkout
        txn_qs = PaymentTransaction.objects.filter(tenant=tenant)
        checkout_lookup = (
            models.Q(raw_payload__reference_id=reference) |
            models.Q(gateway_transaction_id=reference)
        )
        if amount and amount > Decimal('0.00'):
            # Only match customer_account if accompanied by the expected amount for this checkout
            checkout_lookup |= (models.Q(customer_account=reference) & models.Q(amount=amount))
            txn = txn_qs.filter(checkout_lookup).order_by('-created_at').first()
        else:
            # Do not treat a match on customer_account alone as completion
            txn = txn_qs.filter(checkout_lookup).order_by('-created_at').first()

        if txn:
            return Response({"status": "Completed", "transaction_id": str(txn.id)})

        return Response({"status": "Pending"})

    def post(self, request, *args, **kwargs):
        tenant = get_tenant_for_request(request)
        data = request.data if isinstance(request.data, dict) else {}
        reference = str(data.get('reference') or request.query_params.get('reference') or '').strip()
        amount_str = data.get('amount') or request.query_params.get('amount')

        if not reference:
            return Response({"error": "reference required"}, status=400)

        amount = None
        if amount_str:
            try:
                amount = Decimal(str(amount_str))
            except Exception:
                pass

        entity_type, entity = self._get_entity_for_user(request.user, tenant)
        if not entity_type:
            return Response({"error": "Unauthorized: requester is not linked to an active customer or reseller account."}, status=status.HTTP_403_FORBIDDEN)

        # Unmatched events queryset: exclude events unless their amount is positive
        unmatched_events = InboundPaymentEvent.objects.filter(
            tenant=tenant,
            status=InboundPaymentEvent.EventStatus.UNMATCHED,
            amount__gt=Decimal('0.00')
        )
        if amount and amount > Decimal('0.00'):
            unmatched_events = unmatched_events.filter(amount=amount)

        # Authorize settlement against the authenticated requester's own account
        if entity_type == 'customer':
            customer = entity
            event = unmatched_events.filter(
                models.Q(reference_id__iexact=customer.customer_code) |
                models.Q(reference_id__iexact=customer.pppoe_username) |
                models.Q(reference_id__iexact=str(customer.id)) |
                models.Q(reference_id__iexact=reference) |
                models.Q(sender_account=reference)
            ).first()

            if event:
                txn, _ = _settle_customer_payment(
                    tenant=tenant,
                    customer=customer,
                    amount=event.amount,
                    trx_id=event.trx_id,
                    payment_method=f"Matched {event.provider or 'MFS'}",
                    raw_payload={"event_id": str(event.id), "reference_id": reference}
                )
                event.status = InboundPaymentEvent.EventStatus.MATCHED
                event.matched_customer = customer
                event.matched_transaction = txn
                event.processed_at = timezone.now()
                event.save(update_fields=['status', 'matched_customer', 'matched_transaction', 'processed_at'])
                return Response({"status": "Completed", "transaction_id": str(txn.id)})

        elif entity_type == 'reseller':
            reseller = entity
            event = unmatched_events.filter(
                models.Q(reference_id__iexact=reseller.user.username) |
                models.Q(reference_id__iexact=str(reseller.id)) |
                models.Q(reference_id__iexact=reference) |
                models.Q(sender_account=reference)
            ).first()

            if event:
                txn, _ = _settle_reseller_payment(
                    tenant=tenant,
                    reseller=reseller,
                    amount=event.amount,
                    trx_id=event.trx_id,
                    payment_method=f"Matched {event.provider or 'MFS'}",
                    raw_payload={"event_id": str(event.id), "reference_id": reference}
                )
                event.status = InboundPaymentEvent.EventStatus.MATCHED
                event.matched_transaction = txn
                event.processed_at = timezone.now()
                event.save(update_fields=['status', 'matched_transaction', 'processed_at'])
                return Response({"status": "Completed", "transaction_id": str(txn.id)})

        elif entity_type == 'staff':
            event = unmatched_events.filter(
                models.Q(reference_id__iexact=reference) |
                models.Q(sender_account=reference)
            ).first()
            if event:
                customer = Customer.objects.filter(tenant=tenant).filter(
                    models.Q(customer_code__iexact=reference) |
                    models.Q(pppoe_username__iexact=reference)
                ).first()
                if customer:
                    txn, _ = _settle_customer_payment(
                        tenant=tenant,
                        customer=customer,
                        amount=event.amount,
                        trx_id=event.trx_id,
                        payment_method=f"Matched {event.provider or 'MFS'}",
                        raw_payload={"event_id": str(event.id), "reference_id": reference}
                    )
                    event.status = InboundPaymentEvent.EventStatus.MATCHED
                    event.matched_customer = customer
                    event.matched_transaction = txn
                    event.processed_at = timezone.now()
                    event.save(update_fields=['status', 'matched_customer', 'matched_transaction', 'processed_at'])
                    return Response({"status": "Completed", "transaction_id": str(txn.id)})

                from apps.authentication.models import Reseller
                reseller = Reseller.objects.filter(tenant=tenant, user__username__iexact=reference).first()
                if reseller:
                    txn, _ = _settle_reseller_payment(
                        tenant=tenant,
                        reseller=reseller,
                        amount=event.amount,
                        trx_id=event.trx_id,
                        payment_method=f"Matched {event.provider or 'MFS'}",
                        raw_payload={"event_id": str(event.id), "reference_id": reference}
                    )
                    event.status = InboundPaymentEvent.EventStatus.MATCHED
                    event.matched_transaction = txn
                    event.processed_at = timezone.now()
                    event.save(update_fields=['status', 'matched_transaction', 'processed_at'])
                    return Response({"status": "Completed", "transaction_id": str(txn.id)})

        # Check if already processed for this specific checkout
        txn_qs = PaymentTransaction.objects.filter(tenant=tenant)
        checkout_lookup = (
            models.Q(raw_payload__reference_id=reference) |
            models.Q(gateway_transaction_id=reference)
        )
        if amount and amount > Decimal('0.00'):
            checkout_lookup |= (models.Q(customer_account=reference) & models.Q(amount=amount))
            txn = txn_qs.filter(checkout_lookup).order_by('-created_at').first()
        else:
            txn = txn_qs.filter(checkout_lookup).order_by('-created_at').first()

        if txn:
            return Response({"status": "Completed", "transaction_id": str(txn.id)})

        return Response({"status": "Pending"})
