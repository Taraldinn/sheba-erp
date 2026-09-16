import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/layouts/AppShell";
import { ThemeProvider } from "@/components/theme-provider";
import { Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";
export const dynamic = "force-dynamic";


const spaceGrotesk = Space_Grotesk({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Sheba ERP - Next-Gen ISP Operations & Billing Platform",
  description: "Enterprise ISP Subscriber Billing, Network Monitoring, OLT Management & Automated Multi-Tenant Platform",
};

import { AuthProvider } from "@/lib/auth";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const host = (headersList.get("host") || "").toLowerCase();
  const isControlPlaneDomain =
    host.startsWith("admin.") ||
    host.startsWith("control.") ||
    host.startsWith("saas.");

  return (
    <html lang="en" className={cn("font-sans", spaceGrotesk.variable)} suppressHydrationWarning>
      <head>
        {/* Inline script: apply stored theme BEFORE first paint to avoid flash */}
        <Script
          id="sheba-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sheba-theme')||'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.add(t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen flex antialiased selection:bg-indigo-500 selection:text-white">
        <ThemeProvider defaultTheme="dark" storageKey="sheba-theme">
          <AuthProvider initialContext={isControlPlaneDomain ? "central_admin" : "tenant"}>
            <AppShell isControlPlaneDomain={isControlPlaneDomain}>
              {children}
            </AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
