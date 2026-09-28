"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import type { CustomerWelcome } from "@/types";

interface Props {
  customerId: string;
  initialWelcome: CustomerWelcome | null | undefined;
  customerName?: string;
  /** When true, render a denser, "succeeded-create" variant. */
  freshIssue?: boolean;
  onResend?: (next: CustomerWelcome) => void;
}

const CHANNEL_LABELS: Record<string, { label: string; icon: typeof Mail }> = {
  sms: { label: "SMS", icon: MessageSquare },
  email: { label: "Email", icon: Mail },
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy to clipboard"
      onClick={() => {
        if (typeof navigator === "undefined" || !navigator.clipboard) return;
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-indigo-500/50 transition-colors cursor-pointer"
    >
      <Copy className="h-3 w-3" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Renders the auto-issued portal credentials (when present) and the
 * dispatch status. Used in two places:
 *
 *  1. The /customers/new success card, immediately after create.
 *  2. The customer detail page / drawer, where it can be used to
 *     rotate or resend the welcome on demand.
 */
export function WelcomeCredentialsCard({
  customerId,
  initialWelcome,
  customerName,
  freshIssue,
  onResend,
}: Props) {
  const [welcome, setWelcome] = useState<CustomerWelcome | null | undefined>(
    initialWelcome
  );
  const [resending, setResending] = useState<"rotate" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!welcome) return null;

  const issued = welcome.issued;
  const dispatch = welcome.dispatch;
  const sentChannels = (dispatch?.sent_via ?? []).filter(Boolean);
  const skippedChannels = dispatch?.skipped ?? [];
  const alreadySent = !issued && (sentChannels.length > 0 || (dispatch as any)?.sent_at);

  async function handleResend(rotate: boolean) {
    setError(null);
    setResending(rotate ? "rotate" : "resend");
    try {
      const next = await ApiClient.resendCustomerWelcome(customerId, rotate);
      setWelcome(next);
      onResend?.(next);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setResending(null);
    }
  }

  return (
    <Card
      className={`border-emerald-500/40 bg-emerald-500/5 shadow-md ${
        freshIssue ? "ring-1 ring-emerald-500/30" : ""
      }`}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              {issued ? (
                <ShieldCheck className="h-5 w-5" />
              ) : alreadySent ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {issued
                  ? "Portal login generated"
                  : alreadySent
                  ? "Welcome already dispatched"
                  : "Portal login not issued"}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {customerName ? `${customerName} — ` : ""}
                {issued
                  ? "Share the credentials below. The plain-text password is shown once."
                  : alreadySent
                  ? "The customer already has their credentials. Use rotate to mint a new password."
                  : "Auto-issuance is disabled for this tenant."}
              </p>
            </div>
          </div>
        </div>

        {issued && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Portal username
              </div>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm font-mono font-semibold text-foreground break-all">
                  {issued.username}
                </code>
                <CopyButton value={issued.username} />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Portal password {issued.regenerated && "(rotated)"}
              </div>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm font-mono font-semibold text-foreground break-all">
                  {issued.password}
                </code>
                <CopyButton value={issued.password} />
              </div>
            </div>
          </div>
        )}

        {/* Dispatch status pills */}
        <div className="flex flex-wrap items-center gap-2">
          {sentChannels.length === 0 && skippedChannels.length === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <XCircle className="h-3 w-3" />
              No channels dispatched
            </span>
          )}
          {sentChannels.map((ch) => {
            const meta = CHANNEL_LABELS[ch] ?? {
              label: ch,
              icon: CheckCircle2,
            };
            const Icon = meta.icon;
            return (
              <span
                key={`sent-${ch}`}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/30"
              >
                <Icon className="h-3 w-3" />
                Sent via {meta.label}
              </span>
            );
          })}
          {skippedChannels.map((reason) => (
            <span
              key={`skip-${reason}`}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-500/30"
              title={`Channel skipped: ${reason.replace(/_/g, " ")}`}
            >
              <XCircle className="h-3 w-3" />
              Skipped: {reason.replace(/_/g, " ")}
            </span>
          ))}
        </div>

        {error && (
          <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={resending !== null}
            onClick={() => handleResend(false)}
            className="gap-1.5 cursor-pointer"
          >
            {resending === "resend" ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Resend welcome
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={resending !== null}
            onClick={() => handleResend(true)}
            className="gap-1.5 cursor-pointer"
          >
            {resending === "rotate" ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            Rotate password & resend
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
