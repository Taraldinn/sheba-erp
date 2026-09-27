import type { Metadata } from "next";
import Script from "next/script";
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
  return (
    <html lang="en" className={cn("font-sans", spaceGrotesk.variable)} suppressHydrationWarning>
      <head>
        {/* Inline script: apply stored theme BEFORE first paint to avoid flash */}
        <Script
          id="sheba-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sheba-theme')||'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.add(t);var h=localStorage.getItem('sheba-theme-heroui');if(h){var p=JSON.parse(h);if(p.presetId){document.documentElement.setAttribute('data-theme',p.presetId);}if(p.accentHue&&p.accentLightness&&p.accentChroma){var c=p.isVibrant?Math.min(p.accentChroma+0.05,0.3):p.accentChroma;var oklch='oklch('+p.accentLightness.toFixed(3)+' '+c.toFixed(3)+' '+p.accentHue.toFixed(2)+')';document.documentElement.style.setProperty('--accent',oklch);document.documentElement.style.setProperty('--color-accent',oklch);document.documentElement.style.setProperty('--primary',oklch);document.documentElement.style.setProperty('--color-primary',oklch);}}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen flex antialiased selection:bg-indigo-500 selection:text-white">
        <ThemeProvider defaultTheme="dark" storageKey="sheba-theme">
          <AuthProvider initialContext="tenant">
            <AppShell>
              {children}
            </AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
