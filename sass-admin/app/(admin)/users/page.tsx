"use client";

import type { SaasUser } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { type AdminColumn } from "@/components/admin-data-table";
import type { ResourceFormConfig } from "@/lib/resource-config";

const usersForm: ResourceFormConfig = {
  fields: [
    {
      name: "username",
      label: "Username",
      required: true,
      helpText: "Unique handle used at sign-in.",
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
    },
    {
      name: "first_name",
      label: "First name",
    },
    {
      name: "last_name",
      label: "Last name",
    },
    {
      name: "password",
      label: "Password",
      type: "password",
      required: true,
      helpText: "Minimum 8 chars. Send only on create — leave blank on edit to keep current.",
      hideOnEdit: true,
    },
    {
      name: "role",
      label: "Role",
      type: "select",
      options: [
        { label: "Platform Admin", value: "PLATFORM_ADMIN" },
        { label: "Tenant Admin", value: "TENANT_ADMIN" },
        { label: "Tenant Manager", value: "TENANT_MANAGER" },
        { label: "Tenant Staff", value: "TENANT_STAFF" },
      ],
      helpText: "Platform admins manage the control plane; tenant roles scope to a single ISP.",
    },
    {
      name: "is_active",
      label: "Active",
      type: "checkbox",
      defaultValue: true,
    },
  ],
  confirmDelete: (row) =>
    `Delete user "${String(row.username ?? row.id)}"? Their sessions and tokens will be revoked.`,
};

const columns: AdminColumn<SaasUser>[] = [
  {
    key: "username",
    header: "Username",
    render: (row: SaasUser) => (
      <span className="font-medium">{row.username}</span>
    ),
  },
  {
    key: "email",
    header: "Email",
    render: (row: SaasUser) => row.email ?? "—",
  },
  {
    key: "name",
    header: "Name",
    render: (row: SaasUser) =>
      [row.first_name, row.last_name].filter(Boolean).join(" ") || "—",
  },
  {
    key: "role",
    header: "Role",
    render: (row: SaasUser) => (
      <Chip
        color={row.is_platform_admin || row.is_superuser ? "accent" : "default"}
        size="sm"
        variant="soft"
      >
        {row.role ?? (row.is_superuser ? "PLATFORM_SUPER_ADMIN" : "—")}
      </Chip>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row: SaasUser) => (
      <Chip
        color={row.is_active === false ? "danger" : "success"}
        size="sm"
        variant="soft"
      >
        {row.is_active === false ? "Inactive" : "Active"}
      </Chip>
    ),
  },
];

export default function UsersPage() {
  return (
    <AdminResourcePage<SaasUser>
      columns={columns}
      description="All users on the platform — staff, resellers, customers."
      endpoint="/users/"
      form={usersForm}
      getRowId={(row) => row.id}
      title="Users"
    />
  );
}
