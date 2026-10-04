import React, { useEffect, useState } from 'react';
import {
  Plus,
  SearchLg,
  Trash01,
  LinkExternal01,
  ShieldTick,
  AlertCircle,
  Copy01,
  RefreshCw01,
  Globe01,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { Domain, Tenant } from '@/api/types';
import { Table, TableCard } from '@/components/application/table/table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';
import { Select } from '@/components/base/select/select';

export function DomainsScreen() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Form
  const [formData, setFormData] = useState({
    domain: '',
    tenant_id: '',
    is_primary: false,
  });

  const loadData = async () => {
    try {
      const [doms, tns] = await Promise.all([saasApi.getDomains(), saasApi.getTenants()]);
      setDomains(doms);
      setTenants(tns);
      if (tns.length > 0 && !formData.tenant_id) {
        setFormData((prev) => ({ ...prev, tenant_id: tns[0].id }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.domain || !formData.tenant_id) return;
    try {
      await saasApi.createDomain(formData);
      setIsAddOpen(false);
      setFormData({ domain: '', tenant_id: tenants[0]?.id || '', is_primary: false });
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await saasApi.verifyDomain(id);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      await saasApi.setPrimaryDomain(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this domain mapping?')) return;
    try {
      await saasApi.deleteDomain(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredDomains = domains.filter(
    (d) =>
      d.domain.toLowerCase().includes(search.toLowerCase()) ||
      (d.tenant_name && d.tenant_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">Custom Domains</h1>
            <Badge color="brand" size="sm">
              {domains.length} Mapped
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            Manage custom branded domains, edge SSL certificates, and DNS verification.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Button
            color="primary"
            size="md"
            iconLeading={Plus}
            onPress={() => setIsAddOpen(true)}
          >
            Add Domain
          </Button>
        </div>
      </div>

      {/* DNS Configuration Helper Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-secondary bg-primary shadow-xs">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid shrink-0 mt-0.5 sm:mt-0">
            <Globe01 className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary">DNS CNAME Edge Record</h3>
            <p className="text-xs text-tertiary">
              Instruct tenants to point their CNAME record to <code className="bg-secondary px-1.5 py-0.5 rounded font-mono text-brand-solid">edge.sheba.app</code> for automated SSL termination.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText('edge.sheba.app');
            alert('Copied CNAME target to clipboard!');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-secondary bg-secondary text-xs font-semibold text-secondary hover:bg-secondary_hover transition"
        >
          <Copy01 className="size-3.5" />
          Copy CNAME
        </button>
      </div>

      {/* Filter and Search */}
      <div className="bg-primary p-4 rounded-xl border border-secondary shadow-xs">
        <Input
          aria-label="Search domains"
          placeholder="Search by domain URL or tenant organization..."
          icon={SearchLg}
          size="sm"
          value={search}
          onChange={(val) => setSearch(val)}
        />
      </div>

      {/* Table */}
      <TableCard.Root>
        <TableCard.Header
          title="Domain Mappings"
          badge={`${filteredDomains.length} Active`}
          description="Edge routing rules and SSL provision status"
        />
        <Table aria-label="Domains Table">
          <Table.Header>
            <Table.Head id="domain" isRowHeader>Domain Hostname</Table.Head>
            <Table.Head id="tenant">Assigned Tenant</Table.Head>
            <Table.Head id="primary">Primary</Table.Head>
            <Table.Head id="dns">DNS Status</Table.Head>
            <Table.Head id="ssl">SSL / TLS</Table.Head>
            <Table.Head id="actions">Actions</Table.Head>
          </Table.Header>
          <Table.Body items={filteredDomains}>
            {(dom) => (
              <Table.Row id={dom.id}>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-primary">{dom.domain}</span>
                    <a
                      href={`https://${dom.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-tertiary hover:text-brand-solid"
                    >
                      <LinkExternal01 className="size-3.5" />
                    </a>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-sm font-medium text-secondary">{dom.tenant_name || dom.tenant_id}</span>
                </Table.Cell>
                <Table.Cell>
                  {dom.is_primary ? (
                    <Badge color="brand" size="sm">
                      Primary
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      color="secondary"
                      onPress={() => handleSetPrimary(dom.id)}
                    >
                      Make Primary
                    </Button>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    color={dom.is_active ? 'success' : 'warning'}
                    size="sm"
                   
                  >
                    {dom.is_active ? 'Verified' : 'Pending DNS'}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-1.5 text-xs">
                    {dom.ssl_active ? (
                      <span className="inline-flex items-center gap-1 text-success-primary font-medium">
                        <ShieldTick className="size-4" /> Active (Auto-renew)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-warning-primary font-medium">
                        <AlertCircle className="size-4" /> Not Issued
                      </span>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-1">
                    {!dom.is_active && (
                      <Button
                        size="sm"
                        color="secondary"
                        iconLeading={RefreshCw01}
                        isLoading={verifyingId === dom.id}
                        onPress={() => handleVerify(dom.id)}
                      >
                        Verify DNS
                      </Button>
                    )}
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={Trash01}
                      className="text-error-primary hover:text-error-solid"
                      onPress={() => handleDelete(dom.id)}
                    />
                  </div>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </TableCard.Root>

      {/* Add Domain Modal */}
      <ModalOverlay isOpen={isAddOpen} onOpenChange={setIsAddOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleAddDomain} className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid">
                      <Globe01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Map Custom Domain</h2>
                      <p className="text-xs text-tertiary">Configure custom subdomain or root domain.</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-4">
                  <Input
                    label="Domain Hostname"
                    placeholder="e.g. app.customerdomain.com"
                    value={formData.domain}
                    onChange={(val) => setFormData({ ...formData, domain: val })}
                    isRequired
                    hint="Enter FQDN without https://"
                  />

                  <Select
                    label="Assign to Tenant Organization"
                    selectedKey={formData.tenant_id}
                    onSelectionChange={(key) => setFormData({ ...formData, tenant_id: String(key) })}
                  >
                    {tenants.map((t) => (
                      <Select.Item key={t.id} id={t.id} label={`${t.name} (${t.schema_name})`}>
                        {t.name} ({t.schema_name})
                      </Select.Item>
                    ))}
                  </Select>

                  <label className="flex items-center gap-2 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={formData.is_primary}
                      onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                      className="rounded border-secondary text-brand-solid focus:ring-brand"
                    />
                    <span className="text-sm font-medium text-secondary">
                      Set as primary domain for this tenant
                    </span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Add Domain Mapping
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  );
}
