import Link from 'next/link';
import { ArrowRight, BookOpen, Layers, Server, Shield, Network, Database, Terminal, Cpu } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[85vh] px-6 py-12 max-w-6xl mx-auto">
      {/* Hero Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-xs font-semibold tracking-wide uppercase rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        Authoritative System Documentation
      </div>

      {/* Hero Heading */}
      <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-center text-foreground mb-6 max-w-3xl leading-tight">
        Engineering & Architecture Portal for <span className="text-blue-600 dark:text-blue-400">Sheba ISP ERP</span>
      </h1>

      <p className="text-lg sm:text-xl text-muted-foreground text-center max-w-2xl mb-10 leading-relaxed">
        Comprehensive technical documentation, architecture blueprints, MikroTik & OLT integration guides, and operational runbooks for the Shebafi ISP platform.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-500/20 transition-all transform hover:-translate-y-0.5"
        >
          <BookOpen className="w-5 h-5" />
          Explore Documentation
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
        <Link
          href="/docs/getting-started/local-development"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-all"
        >
          <Terminal className="w-5 h-5 text-muted-foreground" />
          Quick Start Guide
        </Link>
      </div>

      {/* Feature Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        <Link
          href="/docs/architecture/overview"
          className="group p-6 rounded-xl border border-border bg-card hover:border-blue-500/50 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold mb-2 group-hover:text-blue-600 transition-colors">Architecture Invariants</h3>
          <p className="text-sm text-muted-foreground">
            Shared-database multi-tenancy, server-derived host resolution, and immutable double-entry financial ledger accounting.
          </p>
        </Link>

        <Link
          href="/docs/networking/mikrotik-integration"
          className="group p-6 rounded-xl border border-border bg-card hover:border-blue-500/50 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold mb-2 group-hover:text-indigo-600 transition-colors">MikroTik & OLT Hardware</h3>
          <p className="text-sm text-muted-foreground">
            RouterOS v7 REST and socket automation, PPPoE credentials provisioning, bandwidth queues, and optical diagnostics.
          </p>
        </Link>

        <Link
          href="/docs/backend/overview"
          className="group p-6 rounded-xl border border-border bg-card hover:border-blue-500/50 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Server className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold mb-2 group-hover:text-emerald-600 transition-colors">13 Backend Modules</h3>
          <p className="text-sm text-muted-foreground">
            Cohesive domain modules in Django 6.1, Celery task pipelines, and 52 verified PostgreSQL database models.
          </p>
        </Link>

        <Link
          href="/docs/database/models-inventory"
          className="group p-6 rounded-xl border border-border bg-card hover:border-blue-500/50 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Database className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold mb-2 group-hover:text-amber-600 transition-colors">52 Database Models</h3>
          <p className="text-sm text-muted-foreground">
            Full inventory of tables, foreign key relationships, indexes, constraints, and interactive Mermaid ER diagrams.
          </p>
        </Link>

        <Link
          href="/docs/security/auth-and-rbac"
          className="group p-6 rounded-xl border border-border bg-card hover:border-blue-500/50 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Shield className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold mb-2 group-hover:text-rose-600 transition-colors">Security & RBAC</h3>
          <p className="text-sm text-muted-foreground">
            Token authentication, tenant membership scopes, symmetric Fernet credential encryption, and cardinal security rules.
          </p>
        </Link>

        <Link
          href="/docs/adrs/overview"
          className="group p-6 rounded-xl border border-border bg-card hover:border-blue-500/50 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Network className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold mb-2 group-hover:text-purple-600 transition-colors">10 Formal ADRs</h3>
          <p className="text-sm text-muted-foreground">
            Architecture Decision Records documenting why decisions were made, alternatives considered, and trade-offs accepted.
          </p>
        </Link>
      </div>
    </main>
  );
}
