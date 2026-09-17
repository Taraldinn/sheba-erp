import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { SuperAdminShell } from '@/components/layouts/SuperAdminShell';
import { ThemeProvider } from '@/components/theme-provider';
import { Space_Grotesk } from 'next/font/google';
import { cn } from '@/lib/utils';
import { AuthProvider } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'ShebaFi Global Control Plane - SaaS Super Admin',
  description: 'Enterprise ISP Multi-Tenant Management, Telemetry, Domain Routing, and Secret API Key Orchestration',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn('font-sans', spaceGrotesk.variable)} suppressHydrationWarning>
      <head>
        <Script
          id="sheba-saas-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sheba-theme')||'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.add(t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen flex antialiased selection:bg-violet-600 selection:text-white">
        <ThemeProvider defaultTheme="dark" storageKey="sheba-theme">
          <AuthProvider initialContext="central_admin">
            <SuperAdminShell>
              {children}
            </SuperAdminShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
