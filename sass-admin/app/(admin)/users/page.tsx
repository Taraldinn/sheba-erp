"use client";

import type { SaasUser } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";

const columns = [
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
      getRowId={(row) => row.id}
      title="Users"
    />
  );
}
