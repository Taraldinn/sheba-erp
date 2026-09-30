import type { SVGProps } from "react";

import {
  House,
  Receipt,
  ListCheck,
  ChartColumn,
  Gear,
  CircleQuestion,
  ArrowRightFromSquare,
  LayoutHeaderSideContent,
  Magnifier,
  Bell,
  PersonPlus,
  Sliders,
  BarsDescendingAlignLeft,
  LayoutColumns3,
  Copy,
  Eye,
  Pencil,
  TrashBin,
  Server,
  Globe,
  Persons,
  Boxes3,
  FileText,
  CreditCard,
  Database,
  Cloud,
  ShieldCheck,
  Check,
  Xmark,
  Plus,
  ChevronDown,
  ArrowUpRightFromSquare,
} from "@gravity-ui/icons";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

// Re-export raw Gravity UI icons for direct usage
export {
  House,
  Receipt,
  ListCheck,
  ChartColumn,
  Gear,
  CircleQuestion,
  ArrowRightFromSquare,
  LayoutHeaderSideContent,
  Magnifier,
  Bell,
  PersonPlus,
  Sliders,
  BarsDescendingAlignLeft,
  LayoutColumns3,
  Copy,
  Eye,
  Pencil,
  TrashBin,
  Server,
  Globe,
  Persons,
  Boxes3,
  FileText,
  CreditCard,
  Database,
  Cloud,
  ShieldCheck,
  Check,
  Xmark,
  Plus,
  ChevronDown,
  ArrowUpRightFromSquare,
};

// Typed convenience wrappers with default sizes
export function DashboardIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return <House height={height ?? size} width={width ?? size} {...props} />;
}

export function OrdersIcon({ size = 18, width, height, ...props }: IconProps) {
  return <Receipt height={height ?? size} width={width ?? size} {...props} />;
}

export function TrackerIcon({ size = 18, width, height, ...props }: IconProps) {
  return <ListCheck height={height ?? size} width={width ?? size} {...props} />;
}

export function AnalyticsIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return (
    <ChartColumn height={height ?? size} width={width ?? size} {...props} />
  );
}

export function SettingsIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return <Gear height={height ?? size} width={width ?? size} {...props} />;
}

export function HelpIcon({ size = 18, width, height, ...props }: IconProps) {
  return (
    <CircleQuestion height={height ?? size} width={width ?? size} {...props} />
  );
}

export function LogoutIcon({ size = 18, width, height, ...props }: IconProps) {
  return (
    <ArrowRightFromSquare
      height={height ?? size}
      width={width ?? size}
      {...props}
    />
  );
}

export function SidebarToggleIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return (
    <LayoutHeaderSideContent
      height={height ?? size}
      width={width ?? size}
      {...props}
    />
  );
}

export function SearchIcon({ size = 16, width, height, ...props }: IconProps) {
  return <Magnifier height={height ?? size} width={width ?? size} {...props} />;
}

export function BellIcon({ size = 18, width, height, ...props }: IconProps) {
  return <Bell height={height ?? size} width={width ?? size} {...props} />;
}

export function PlusIcon({ size = 16, width, height, ...props }: IconProps) {
  return <Plus height={height ?? size} width={width ?? size} {...props} />;
}

export function InviteIcon({ size = 16, width, height, ...props }: IconProps) {
  return (
    <PersonPlus height={height ?? size} width={width ?? size} {...props} />
  );
}

export function FilterIcon({ size = 16, width, height, ...props }: IconProps) {
  return <Sliders height={height ?? size} width={width ?? size} {...props} />;
}

export function SortIcon({ size = 16, width, height, ...props }: IconProps) {
  return (
    <BarsDescendingAlignLeft
      height={height ?? size}
      width={width ?? size}
      {...props}
    />
  );
}

export function ColumnsIcon({ size = 16, width, height, ...props }: IconProps) {
  return (
    <LayoutColumns3 height={height ?? size} width={width ?? size} {...props} />
  );
}

export function CopyIcon({ size = 14, width, height, ...props }: IconProps) {
  return <Copy height={height ?? size} width={width ?? size} {...props} />;
}

export function EyeIcon({ size = 16, width, height, ...props }: IconProps) {
  return <Eye height={height ?? size} width={width ?? size} {...props} />;
}

export function EditIcon({ size = 16, width, height, ...props }: IconProps) {
  return <Pencil height={height ?? size} width={width ?? size} {...props} />;
}

export function PencilIcon({ size = 16, width, height, ...props }: IconProps) {
  return <Pencil height={height ?? size} width={width ?? size} {...props} />;
}

export function TrashIcon({ size = 16, width, height, ...props }: IconProps) {
  return <TrashBin height={height ?? size} width={width ?? size} {...props} />;
}

export function DeleteIcon({ size = 16, width, height, ...props }: IconProps) {
  return <TrashBin height={height ?? size} width={width ?? size} {...props} />;
}

export function CheckIcon({ size = 14, width, height, ...props }: IconProps) {
  return <Check height={height ?? size} width={width ?? size} {...props} />;
}

export function XmarkIcon({ size = 16, width, height, ...props }: IconProps) {
  return <Xmark height={height ?? size} width={width ?? size} {...props} />;
}

export function ExternalLinkIcon({
  size = 14,
  width,
  height,
  ...props
}: IconProps) {
  return (
    <ArrowUpRightFromSquare
      height={height ?? size}
      width={width ?? size}
      {...props}
    />
  );
}

export function TenantsIcon({ size = 18, width, height, ...props }: IconProps) {
  return <Server height={height ?? size} width={width ?? size} {...props} />;
}

export function DomainsIcon({ size = 18, width, height, ...props }: IconProps) {
  return <Globe height={height ?? size} width={width ?? size} {...props} />;
}

export function UsersIcon({ size = 18, width, height, ...props }: IconProps) {
  return <Persons height={height ?? size} width={width ?? size} {...props} />;
}

export function PackagesIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return <Boxes3 height={height ?? size} width={width ?? size} {...props} />;
}

export function SubscriptionsIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return <FileText height={height ?? size} width={width ?? size} {...props} />;
}

export function PaymentsIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return (
    <CreditCard height={height ?? size} width={width ?? size} {...props} />
  );
}

export function BackupsIcon({ size = 18, width, height, ...props }: IconProps) {
  return <Database height={height ?? size} width={width ?? size} {...props} />;
}

export function ApplicationsIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return <Cloud height={height ?? size} width={width ?? size} {...props} />;
}

export function CredentialsIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return (
    <ShieldCheck height={height ?? size} width={width ?? size} {...props} />
  );
}

export function AuditLogsIcon({
  size = 18,
  width,
  height,
  ...props
}: IconProps) {
  return (
    <ShieldCheck height={height ?? size} width={width ?? size} {...props} />
  );
}
