import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layouts/Sidebar";
import { Header } from "@/components/layouts/Header";
import { ThemeProvider } from "@/components/theme-provider";
import { Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";

const spaceGrotesk = Space_Grotesk({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Sheba ERP - Next-Gen ISP Operations & Billing Platform",
  description: "Enterprise ISP Subscriber Billing, Network Monitoring, OLT Management & Automated Multi-Tenant Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", spaceGrotesk.variable)} suppressHydrationWarning>
      <head>
        {/* Inline script: apply stored theme BEFORE first paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sheba-theme')||'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.add(t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen flex antialiased selection:bg-indigo-500 selection:text-white">
        <ThemeProvider defaultTheme="dark" storageKey="sheba-theme">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
