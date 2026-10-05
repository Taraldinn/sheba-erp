import React, { useEffect, useState } from 'react';
import {
  Plus,
  SearchLg,
  Edit01,
  Trash01,
  Users01,
  Mail01,
  Phone01,
  RefreshCw01,
  FilterLines,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { SaaSEmployee } from '@/api/types';
import { Table, TableCard } from '@/components/application/table/table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';
import { Select } from '@/components/base/select/select';

export function EmployeesScreen() {
  const [employees, setEmployees] = useState<SaaSEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<SaaSEmployee | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    worker_id: '',
    full_name: '',
    email: '',
    phone: '',
    role: '',
    department: 'Engineering',
    worker_type: 'Employee',
    basic_salary: 9000,
    is_active: true,
  });

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (roleFilter !== 'All') params.role = roleFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const data = await saasApi.getEmployees(params);
      setEmployees(data);
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [search, roleFilter, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.email) return;
    try {
      await saasApi.createEmployee(formData);
      setIsAddOpen(false);
      setFormData({
        worker_id: '',
        full_name: '',
        email: '',
        phone: '',
        role: '',
        department: 'Engineering',
        worker_type: 'Employee',
        basic_salary: 9000,
        is_active: true,
      });
      loadEmployees();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    try {
      await saasApi.updateEmployee(selectedEmployee.id, formData);
      setIsEditOpen(false);
      setSelectedEmployee(null);
      loadEmployees();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!selectedEmployee) return;
    try {
      await saasApi.deleteEmployee(selectedEmployee.id);
      setIsDeleteOpen(false);
      setSelectedEmployee(null);
      loadEmployees();
    } catch (err) {
      console.error(err);
    }
  };

  const openEdit = (emp: SaaSEmployee) => {
    setSelectedEmployee(emp);
    setFormData({
      worker_id: emp.worker_id,
      full_name: emp.full_name,
      email: emp.email,
      phone: emp.phone || '',
      role: emp.role || emp.designation || '',
      department: emp.department || 'Engineering',
      worker_type: emp.worker_type || 'Employee',
      basic_salary: emp.basic_salary || 9000,
      is_active: emp.is_active,
    });
    setIsEditOpen(true);
  };

  const departments = ['Engineering', 'Product', 'Design', 'Infrastructure', 'Security', 'Operations', 'Executive', 'Marketing'];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">Control Plane Staff & Team</h1>
            <Badge color="brand" size="sm">
              {employees.length} Personnel
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            SaaS Platform engineering, operations, security, and NOC staff accounts under authoritative central control.
          </p>
        </div>
        <div className="mt-4 flex items-center gap-3 sm:mt-0">
          <Button
            color="secondary"
            size="md"
            iconLeading={RefreshCw01}
            onPress={loadEmployees}
            isDisabled={loading}
          >
            Refresh
          </Button>
          <Button
            color="primary"
            size="md"
            iconLeading={Plus}
            onPress={() => {
              setFormData({
                worker_id: `#${Math.floor(Math.random() * 89999 + 4580000)}`,
                full_name: '',
                email: '',
                phone: '',
                role: 'Platform Engineer',
                department: 'Engineering',
                worker_type: 'Employee',
                basic_salary: 9500,
                is_active: true,
              });
              setIsAddOpen(true);
            }}
          >
            Add Team Member
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-primary p-4 rounded-xl border border-secondary shadow-xs">
        <div className="w-full sm:w-80">
          <Input
            aria-label="Search employees"
            placeholder="Search by name, worker ID, email, or role..."
            icon={SearchLg}
            size="sm"
            value={search}
            onChange={(val) => setSearch(val)}
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <div className="w-48">
            <Select
              size="sm"
              icon={FilterLines}
              aria-label="Filter by department"
              selectedKey={roleFilter}
              onSelectionChange={(key) => setRoleFilter(String(key))}
            >
              <Select.Item id="All" label="All Departments">
                All Departments
              </Select.Item>
              {departments.map((d) => (
                <Select.Item key={d} id={d} label={d}>
                  {d}
                </Select.Item>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-1">
            {(['all', 'active', 'inactive'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  statusFilter === filter
                    ? 'bg-brand-primary_alt text-brand-secondary ring-1 ring-brand'
                    : 'text-tertiary hover:bg-secondary'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <TableCard.Root>
        <TableCard.Header
          title="Team Directory"
          badge={`${employees.length} Members`}
          description="Central SaaS staff profiles mapped to platform operations"
        />
        <Table aria-label="Employees Table">
          <Table.Header>
            <Table.Head id="employee" isRowHeader>Employee Name</Table.Head>
            <Table.Head id="worker_id">Worker ID</Table.Head>
            <Table.Head id="department">Department</Table.Head>
            <Table.Head id="type">Contract Type</Table.Head>
            <Table.Head id="status">Status</Table.Head>
            <Table.Head id="actions">Actions</Table.Head>
          </Table.Header>
          <Table.Body items={employees}>
            {(emp) => (
              <Table.Row id={String(emp.id)}>
                <Table.Cell>
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-brand-primary_alt text-brand-solid flex items-center justify-center font-bold text-sm shrink-0 border border-brand/20">
                      {emp.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase() || 'SA'}
                    </div>
                    <div>
                      <div className="font-semibold text-primary">{emp.full_name}</div>
                      <div className="text-xs text-tertiary flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Mail01 className="size-3 text-tertiary" />
                          {emp.email}
                        </span>
                        {emp.phone && (
                          <span className="flex items-center gap-1">
                            <Phone01 className="size-3 text-tertiary" />
                            {emp.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Table.Cell>

                <Table.Cell>
                  <span className="font-mono text-xs bg-secondary px-2 py-1 rounded border border-secondary text-secondary">
                    {emp.worker_id || emp.employee_code}
                  </span>
                </Table.Cell>

                <Table.Cell>
                  <div>
                    <div className="text-xs font-semibold text-primary">{emp.role || emp.designation}</div>
                    <div className="text-[11px] text-tertiary">{emp.department}</div>
                  </div>
                </Table.Cell>

                <Table.Cell>
                  <Badge color="gray" size="sm">
                    {emp.worker_type || 'Employee'}
                  </Badge>
                </Table.Cell>

                <Table.Cell>
                  <Badge
                    color={emp.is_active ? 'success' : 'error'}
                    size="sm"
                  >
                    {emp.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </Table.Cell>

                <Table.Cell>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={Edit01}
                      aria-label="Edit Member"
                      onPress={() => openEdit(emp)}
                    />
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={Trash01}
                      className="text-error-primary hover:text-error-solid"
                      aria-label="Remove Member"
                      onPress={() => {
                        setSelectedEmployee(emp);
                        setIsDeleteOpen(true);
                      }}
                    />
                  </div>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </TableCard.Root>

      {/* Add Employee Modal */}
      <ModalOverlay isOpen={isAddOpen} onOpenChange={setIsAddOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-brand-primary_alt p-2.5 text-brand-solid">
                      <Users01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Add Team Member</h2>
                      <p className="text-xs text-tertiary">Register a SaaS platform engineer or operator</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-3">
                  <Input
                    label="Full Name"
                    placeholder="e.g. Alex Turner"
                    value={formData.full_name}
                    onChange={(val) => setFormData({ ...formData, full_name: val })}
                    isRequired
                  />

                  <Input
                    label="Worker ID"
                    placeholder="e.g. #4586936"
                    value={formData.worker_id}
                    onChange={(val) => setFormData({ ...formData, worker_id: val })}
                    isRequired
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Email"
                      type="email"
                      placeholder="alex@sheba.app"
                      value={formData.email}
                      onChange={(val) => setFormData({ ...formData, email: val })}
                      isRequired
                    />
                    <Input
                      label="Phone"
                      placeholder="+1 (555) 019-2834"
                      value={formData.phone}
                      onChange={(val) => setFormData({ ...formData, phone: val })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Role / Title"
                      placeholder="e.g. Senior DevOps Specialist"
                      value={formData.role}
                      onChange={(val) => setFormData({ ...formData, role: val })}
                      isRequired
                    />
                    <Select
                      label="Department"
                      selectedKey={formData.department}
                      onSelectionChange={(key) => setFormData({ ...formData, department: String(key) })}
                    >
                      {departments.map((d) => (
                        <Select.Item key={d} id={d} label={d}>
                          {d}
                        </Select.Item>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Add Member
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Edit Employee Modal */}
      <ModalOverlay isOpen={isEditOpen} onOpenChange={setIsEditOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleUpdate} className="p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-secondary p-2.5 text-primary">
                      <Edit01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Edit Member Details</h2>
                      <p className="text-xs text-tertiary">Modify profile for {selectedEmployee?.full_name}</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-3">
                  <Input
                    label="Full Name"
                    value={formData.full_name}
                    onChange={(val) => setFormData({ ...formData, full_name: val })}
                    isRequired
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Email"
                      type="email"
                      value={formData.email}
                      onChange={(val) => setFormData({ ...formData, email: val })}
                      isRequired
                    />
                    <Input
                      label="Phone"
                      value={formData.phone}
                      onChange={(val) => setFormData({ ...formData, phone: val })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Role / Title"
                      value={formData.role}
                      onChange={(val) => setFormData({ ...formData, role: val })}
                      isRequired
                    />
                    <Select
                      label="Department"
                      selectedKey={formData.department}
                      onSelectionChange={(key) => setFormData({ ...formData, department: String(key) })}
                    >
                      {departments.map((d) => (
                        <Select.Item key={d} id={d} label={d}>
                          {d}
                        </Select.Item>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Save Changes
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Delete Confirmation Modal */}
      <ModalOverlay isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <Modal className="max-w-md">
          <Dialog>
            {({ close }) => (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-error-primary_alt p-2.5 text-error-solid">
                    <Trash01 className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-primary">Remove Staff Member?</h2>
                    <p className="text-xs text-tertiary">Revoke control plane access</p>
                  </div>
                </div>

                <p className="text-sm text-secondary">
                  Are you sure you want to remove <strong className="text-primary">{selectedEmployee?.full_name}</strong>? Their administrative permissions and operator credentials will be revoked.
                </p>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    className="bg-error-solid hover:bg-error-solid/90 text-white"
                    onPress={handleDelete}
                  >
                    Remove Member
                  </Button>
                </div>
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  );
}
