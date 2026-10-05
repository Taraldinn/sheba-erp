import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import {
  customerApi,
  serviceApi,
  subscriptionApi,
  invoiceApi,
  paymentApi,
  ispPackageApi,
  type CustomerItem,
  type CustomerServiceItem,
  type CustomerSubscriptionItem,
  type IspInvoiceItem,
  type IspPaymentItem,
  type IspPackageItem,
} from '@/api/client';
import {
  ArrowLeft,
  User01,
  Server01,
  LayersTwo01,
  ReceiptCheck,
  CreditCard01,
  Plus,
  Play,
  PauseCircle,
  Trash01,
  RefreshCw01,
  XClose,
} from '@untitledui/icons';

export function CustomerDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<CustomerItem | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'subscriptions' | 'invoices' | 'payments'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab datasets
  const [services, setServices] = useState<CustomerServiceItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<CustomerSubscriptionItem[]>([]);
  const [invoices, setInvoices] = useState<IspInvoiceItem[]>([]);
  const [payments, setPayments] = useState<IspPaymentItem[]>([]);
  const [packages, setPackages] = useState<IspPackageItem[]>([]);

  // Action Modals
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [newServiceData, setNewServiceData] = useState({
    service_type: 'BROADBAND',
    service_identifier: '',
    monthly_price: 500,
    package: '',
    notes: '',
  });

  const [isPayInvoiceOpen, setIsPayInvoiceOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<IspInvoiceItem | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState('Cash');

  // Load customer profile
  const loadCustomer = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const c = await customerApi.get(id);
      setCustomer(c);
      setNewServiceData((prev) => ({
        ...prev,
        service_identifier: c.pppoe_username ? `${c.pppoe_username}_svc2` : '',
      }));
    } catch (err: any) {
      setError(err?.message || 'Failed to load customer');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCustomer();
    ispPackageApi.list().then((res) => setPackages(res.items)).catch(() => {});
  }, [loadCustomer]);

  // Tab data fetching on demand
  useEffect(() => {
    if (!id) return;
    if (activeTab === 'services') {
      serviceApi.list({ customer: id }).then((r) => setServices(r.items)).catch(() => {});
    } else if (activeTab === 'subscriptions') {
      subscriptionApi.list({ customer: id }).then((r) => setSubscriptions(r.items)).catch(() => {});
    } else if (activeTab === 'invoices') {
      invoiceApi.list({ customer: id }).then((r) => setInvoices(r.items)).catch(() => {});
    } else if (activeTab === 'payments') {
      paymentApi.list({ customer: id }).then((r) => setPayments(r.items)).catch(() => {});
    }
  }, [id, activeTab]);

  // Status transitions for Customer
  const handleToggleCustomerStatus = async (newStatus: string) => {
    if (!customer) return;
    try {
      await customerApi.changeStatus(customer.id, newStatus);
      loadCustomer();
    } catch (err: any) {
      alert(err?.message || 'Failed to update customer status');
    }
  };

  // Service Lifecycle Actions
  const handleActivateService = async (serviceId: string) => {
    try {
      await serviceApi.activate(serviceId);
      if (id) serviceApi.list({ customer: id }).then((r) => setServices(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to activate service');
    }
  };

  const handleSuspendService = async (serviceId: string) => {
    const reason = prompt('Enter suspension reason:', 'Non-payment') || '';
    try {
      await serviceApi.suspend(serviceId, reason);
      if (id) serviceApi.list({ customer: id }).then((r) => setServices(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to suspend service');
    }
  };

  const handleResumeService = async (serviceId: string) => {
    try {
      await serviceApi.resume(serviceId);
      if (id) serviceApi.list({ customer: id }).then((r) => setServices(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to resume service');
    }
  };

  const handleTerminateService = async (serviceId: string) => {
    if (!confirm('Are you sure? Terminating a service is permanent.')) return;
    try {
      await serviceApi.terminate(serviceId, 'Operator manual termination');
      if (id) serviceApi.list({ customer: id }).then((r) => setServices(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to terminate service');
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newServiceData.service_identifier) return;
    try {
      await serviceApi.create({
        customer: id,
        ...newServiceData,
      });
      setIsAddServiceOpen(false);
      serviceApi.list({ customer: id }).then((r) => setServices(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to create service');
    }
  };

  // Subscription Lifecycle Actions
  const handleActivateSubscription = async (subId: string) => {
    try {
      await subscriptionApi.activate(subId);
      if (id) subscriptionApi.list({ customer: id }).then((r) => setSubscriptions(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to activate subscription');
    }
  };

  const handleRenewSubscription = async (subId: string) => {
    try {
      await subscriptionApi.renew(subId, 30);
      if (id) subscriptionApi.list({ customer: id }).then((r) => setSubscriptions(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to renew subscription');
    }
  };

  const handleCancelSubscription = async (subId: string) => {
    if (!confirm('Cancel this subscription?')) return;
    try {
      await subscriptionApi.cancel(subId);
      if (id) subscriptionApi.list({ customer: id }).then((r) => setSubscriptions(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel subscription');
    }
  };

  // Invoice Actions
  const handleIssueInvoice = async (invId: string) => {
    try {
      await invoiceApi.issue(invId);
      if (id) invoiceApi.list({ customer: id }).then((r) => setInvoices(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to issue invoice');
    }
  };

  const handleVoidInvoice = async (invId: string) => {
    const reason = prompt('Reason for voiding invoice:', 'Billing correction') || '';
    try {
      await invoiceApi.void(invId, reason);
      if (id) invoiceApi.list({ customer: id }).then((r) => setInvoices(r.items));
    } catch (err: any) {
      alert(err?.message || 'Failed to void invoice');
    }
  };

  const handlePayInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      await invoiceApi.pay(selectedInvoice.id, {
        amount: payAmount,
        payment_method: payMethod,
      });
      setIsPayInvoiceOpen(false);
      setSelectedInvoice(null);
      if (id) {
        invoiceApi.list({ customer: id }).then((r) => setInvoices(r.items));
        loadCustomer();
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to process invoice payment');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-tertiary">
        <RefreshCw01 className="size-6 animate-spin mr-2" /> Loading customer details...
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="text-error font-medium">{error || 'Customer not found'}</div>
        <Button size="md" color="secondary" onClick={() => navigate('/customers')}>
          <ArrowLeft className="size-4 mr-1.5" /> Back to Customers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <button
          type="button"
          className="flex items-center text-xs font-medium text-tertiary hover:text-primary mb-3"
          onClick={() => navigate('/customers')}
        >
          <ArrowLeft className="size-3.5 mr-1" /> Back to Customers
        </button>

        {/* Customer Header Banner */}
        <div className="bg-primary rounded-xl border border-secondary p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-full bg-brand-secondary flex items-center justify-center text-brand-primary font-bold text-xl">
              {customer.full_name?.charAt(0) || 'C'}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-primary">{customer.full_name}</h1>
                <Badge
                  color={
                    customer.status === 'Active'
                      ? 'success'
                      : customer.status === 'Suspended'
                      ? 'warning'
                      : 'error'
                  }
                >
                  {customer.status}
                </Badge>
              </div>
              <p className="text-xs text-tertiary mt-0.5">
                Account ID: <span className="font-mono text-secondary">{customer.customer_code || customer.id.slice(0, 8)}</span> · Username: <span className="font-mono text-secondary">{customer.pppoe_username}</span> · Mobile: {customer.mobile}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {customer.status === 'Active' ? (
              <Button size="sm" color="secondary" onClick={() => handleToggleCustomerStatus('Suspended')}>
                Suspend Account
              </Button>
            ) : (
              <Button size="sm" color="primary" onClick={() => handleToggleCustomerStatus('Active')}>
                Activate Account
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-secondary flex items-center gap-6 text-sm font-medium">
        <button
          type="button"
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'overview'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-tertiary hover:text-primary'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          <User01 className="size-4" /> Profile & Overview
        </button>

        <button
          type="button"
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'services'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-tertiary hover:text-primary'
          }`}
          onClick={() => setActiveTab('services')}
        >
          <Server01 className="size-4" /> Services ({services.length})
        </button>

        <button
          type="button"
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'subscriptions'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-tertiary hover:text-primary'
          }`}
          onClick={() => setActiveTab('subscriptions')}
        >
          <LayersTwo01 className="size-4" /> Subscriptions ({subscriptions.length})
        </button>

        <button
          type="button"
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'invoices'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-tertiary hover:text-primary'
          }`}
          onClick={() => setActiveTab('invoices')}
        >
          <ReceiptCheck className="size-4" /> Invoices ({invoices.length})
        </button>

        <button
          type="button"
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'payments'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-tertiary hover:text-primary'
          }`}
          onClick={() => setActiveTab('payments')}
        >
          <CreditCard01 className="size-4" /> Payments ({payments.length})
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-primary border border-secondary rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-primary text-base">Subscriber Information</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between py-1 border-b border-secondary/50">
                <span className="text-tertiary">Customer Code</span>
                <span className="font-medium text-primary">{customer.customer_code || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-secondary/50">
                <span className="text-tertiary">Phone Number</span>
                <span className="font-medium text-primary">{customer.mobile}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-secondary/50">
                <span className="text-tertiary">Email Address</span>
                <span className="font-medium text-primary">{customer.email || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-secondary/50">
                <span className="text-tertiary">Address</span>
                <span className="font-medium text-primary text-right max-w-xs">{customer.address || '—'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-tertiary">Registered On</span>
                <span className="font-medium text-primary">{new Date(customer.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-primary border border-secondary rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-primary text-base">Primary Plan & Financials</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between py-1 border-b border-secondary/50">
                <span className="text-tertiary">Assigned Package</span>
                <span className="font-medium text-primary">{customer.package_name || 'No package'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-secondary/50">
                <span className="text-tertiary">Monthly Bill</span>
                <span className="font-semibold text-primary">৳{customer.monthly_bill}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-secondary/50">
                <span className="text-tertiary">Outstanding Due</span>
                <span className={`font-semibold ${Number(customer.due_amount) > 0 ? 'text-error' : 'text-success'}`}>
                  ৳{customer.due_amount}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-secondary/50">
                <span className="text-tertiary">Advance Balance</span>
                <span className="font-medium text-primary">৳{customer.advance_amount}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-tertiary">Expiry Date</span>
                <span className="font-medium text-primary">{customer.expiry_date || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Services */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-primary text-base">Customer Services</h3>
              <p className="text-xs text-tertiary">Dedicated broadband, leased lines, or static IPs attached to this account.</p>
            </div>
            <Button size="sm" color="primary" onClick={() => setIsAddServiceOpen(true)}>
              <Plus className="size-3.5 mr-1" /> Add Service
            </Button>
          </div>

          <div className="bg-primary border border-secondary rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary text-xs uppercase text-tertiary border-b border-secondary">
                <tr>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Identifier / Username</th>
                  <th className="px-5 py-3">Package / Rate</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {services.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-tertiary">
                      No services provisioned yet.
                    </td>
                  </tr>
                ) : (
                  services.map((svc) => (
                    <tr key={svc.id} className="hover:bg-secondary/40">
                      <td className="px-5 py-3.5 font-medium text-primary">{svc.service_type}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-secondary">{svc.service_identifier}</td>
                      <td className="px-5 py-3.5 text-secondary">
                        {svc.package_name || 'Custom'} · ৳{svc.monthly_price}/mo
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge
                          color={
                            svc.status === 'ACTIVE'
                              ? 'success'
                              : svc.status === 'SUSPENDED'
                              ? 'warning'
                              : svc.status === 'TERMINATED'
                              ? 'error'
                              : 'gray'
                          }
                        >
                          {svc.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1">
                        {svc.status === 'PENDING' && (
                          <Button size="sm" color="secondary" onClick={() => handleActivateService(svc.id)}>
                            <Play className="size-3 text-success mr-1" /> Activate
                          </Button>
                        )}
                        {svc.status === 'ACTIVE' && (
                          <Button size="sm" color="secondary" onClick={() => handleSuspendService(svc.id)}>
                            <PauseCircle className="size-3 text-warning mr-1" /> Suspend
                          </Button>
                        )}
                        {svc.status === 'SUSPENDED' && (
                          <Button size="sm" color="secondary" onClick={() => handleResumeService(svc.id)}>
                            <Play className="size-3 text-success mr-1" /> Resume
                          </Button>
                        )}
                        {svc.status !== 'TERMINATED' && (
                          <Button size="sm" color="secondary" onClick={() => handleTerminateService(svc.id)}>
                            <Trash01 className="size-3 text-error mr-1" /> Terminate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Subscriptions */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-primary text-base">Recurring Subscriptions</h3>
              <p className="text-xs text-tertiary">Commercial billing contract governing customer service terms.</p>
            </div>
          </div>

          <div className="bg-primary border border-secondary rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary text-xs uppercase text-tertiary border-b border-secondary">
                <tr>
                  <th className="px-5 py-3">Service Line</th>
                  <th className="px-5 py-3">Cycle & Plan</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Next Billing</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-tertiary">
                      No active subscriptions found.
                    </td>
                  </tr>
                ) : (
                  subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-secondary/40">
                      <td className="px-5 py-3.5 font-mono text-xs text-primary">{sub.service_identifier || 'Broadband Line'}</td>
                      <td className="px-5 py-3.5 text-secondary">{sub.package_name || 'Standard'} ({sub.billing_cycle})</td>
                      <td className="px-5 py-3.5 font-semibold text-primary">৳{sub.price}</td>
                      <td className="px-5 py-3.5 text-secondary">{sub.next_billing_date || '—'}</td>
                      <td className="px-5 py-3.5">
                        <Badge color={sub.status === 'ACTIVE' ? 'success' : sub.status === 'SUSPENDED' ? 'warning' : 'gray'}>
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1">
                        {sub.status === 'PENDING' && (
                          <Button size="sm" color="secondary" onClick={() => handleActivateSubscription(sub.id)}>
                            Activate
                          </Button>
                        )}
                        {sub.status === 'ACTIVE' && (
                          <Button size="sm" color="secondary" onClick={() => handleRenewSubscription(sub.id)}>
                            Renew (+30d)
                          </Button>
                        )}
                        {sub.status !== 'CANCELLED' && (
                          <Button size="sm" color="secondary" onClick={() => handleCancelSubscription(sub.id)}>
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Invoices */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-primary text-base">Invoices</h3>
              <p className="text-xs text-tertiary">Itemized billing invoices issued to this subscriber.</p>
            </div>
          </div>

          <div className="bg-primary border border-secondary rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary text-xs uppercase text-tertiary border-b border-secondary">
                <tr>
                  <th className="px-5 py-3">Invoice No</th>
                  <th className="px-5 py-3">Month</th>
                  <th className="px-5 py-3">Total Payable</th>
                  <th className="px-5 py-3">Paid / Due</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-tertiary">
                      No invoices recorded.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-secondary/40">
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-primary">{inv.invoice_no}</td>
                      <td className="px-5 py-3.5 text-secondary">{inv.billing_month}</td>
                      <td className="px-5 py-3.5 font-semibold text-primary">৳{inv.total_payable}</td>
                      <td className="px-5 py-3.5 text-xs text-secondary">
                        Paid: ৳{inv.paid_amount} · <span className="text-error font-medium">Due: ৳{inv.due_amount}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge
                          color={
                            inv.status === 'PAID'
                              ? 'success'
                              : inv.status === 'ISSUED' || inv.status === 'UNPAID'
                              ? 'warning'
                              : 'gray'
                          }
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1">
                        {inv.status === 'DRAFT' && (
                          <Button size="sm" color="secondary" onClick={() => handleIssueInvoice(inv.id)}>
                            Issue
                          </Button>
                        )}
                        {(inv.status === 'ISSUED' || inv.status === 'UNPAID' || inv.status === 'PARTIAL') && (
                          <Button
                            size="sm"
                            color="primary"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setPayAmount(Number(inv.due_amount) || Number(inv.total_payable));
                              setIsPayInvoiceOpen(true);
                            }}
                          >
                            Pay
                          </Button>
                        )}
                        {inv.status !== 'PAID' && inv.status !== 'VOID' && (
                          <Button size="sm" color="secondary" onClick={() => handleVoidInvoice(inv.id)}>
                            Void
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Payments */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-primary text-base">Payment History</h3>
              <p className="text-xs text-tertiary">Financial ledger of payments, receipts, and gateway transactions.</p>
            </div>
          </div>

          <div className="bg-primary border border-secondary rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary text-xs uppercase text-tertiary border-b border-secondary">
                <tr>
                  <th className="px-5 py-3">Transaction ID</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-tertiary">
                      No payments found.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id} className="hover:bg-secondary/40">
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-primary">{p.trx_id}</td>
                      <td className="px-5 py-3.5 text-secondary">{p.payment_method}</td>
                      <td className="px-5 py-3.5 font-semibold text-success">৳{p.amount}</td>
                      <td className="px-5 py-3.5">
                        <Badge color={p.status === 'Success' ? 'success' : 'gray'}>{p.status}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-tertiary text-xs">
                        {new Date(p.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Service Modal */}
      {isAddServiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-primary rounded-xl border border-secondary shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-secondary pb-3">
              <h3 className="font-semibold text-primary">Provision Secondary Service</h3>
              <button onClick={() => setIsAddServiceOpen(false)} className="text-tertiary hover:text-primary">
                <XClose className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateService} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Service Type</label>
                <select
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                  value={newServiceData.service_type}
                  onChange={(e) => setNewServiceData({ ...newServiceData, service_type: e.target.value })}
                >
                  <option value="BROADBAND">Broadband Internet</option>
                  <option value="STATIC_IP">Dedicated Static IP</option>
                  <option value="IPTV">IPTV Service</option>
                  <option value="VOIP">VoIP / SIP Trunk</option>
                  <option value="LEASED_LINE">Corporate Leased Line</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Service Identifier / Circuit ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. static_ip_01 or pppoe_line2"
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary font-mono"
                  value={newServiceData.service_identifier}
                  onChange={(e) => setNewServiceData({ ...newServiceData, service_identifier: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Package (Optional)</label>
                <select
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                  value={newServiceData.package}
                  onChange={(e) => {
                    const selected = packages.find((p) => p.id === e.target.value);
                    setNewServiceData({
                      ...newServiceData,
                      package: e.target.value,
                      monthly_price: selected ? Number(selected.regular_price) : newServiceData.monthly_price,
                    });
                  }}
                >
                  <option value="">-- No package / Custom --</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({pkg.speed_mbps} Mbps) - ৳{pkg.regular_price}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Monthly Price (৳)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                  value={newServiceData.monthly_price}
                  onChange={(e) => setNewServiceData({ ...newServiceData, monthly_price: Number(e.target.value) })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-secondary">
                <Button size="sm" color="secondary" type="button" onClick={() => setIsAddServiceOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" color="primary" type="submit">
                  Provision Service
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Invoice Modal */}
      {isPayInvoiceOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-primary rounded-xl border border-secondary shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-secondary pb-3">
              <div>
                <h3 className="font-semibold text-primary">Record Invoice Payment</h3>
                <p className="text-xs text-tertiary">Invoice #{selectedInvoice.invoice_no}</p>
              </div>
              <button onClick={() => setIsPayInvoiceOpen(false)} className="text-tertiary hover:text-primary">
                <XClose className="size-5" />
              </button>
            </div>

            <form onSubmit={handlePayInvoiceSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Payment Amount (৳)</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Payment Method</label>
                <select
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="Cash">Cash</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-secondary">
                <Button size="sm" color="secondary" type="button" onClick={() => setIsPayInvoiceOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" color="primary" type="submit">
                  Confirm Payment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
