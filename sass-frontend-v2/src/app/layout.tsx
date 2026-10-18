import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { headers, cookies } from "next/headers";
import "./globals.css";
import { AppProviders } from "./providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Shebafi — ISP ERP & SaaS control plane",
    template: "%s · Shebafi",
  },
  description:
    "Subscribers, billing, MikroTik, OLT and ONU operations for broadband providers — in one multi-tenant console.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerList = await headers();
  const cookieStore = await cookies();
  const host = headerList.get("host") || "localhost";
  const initialTenant = cookieStore.get("saas_tenant_slug")?.value || null;
  const initialPreset = (cookieStore.get("sheba_theme_preset")?.value as "signal" | "indigo") || "signal";
  const initialDensity = (cookieStore.get("sheba_density")?.value as "comfortable" | "compact") || "comfortable";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={initialPreset}
      data-density={initialDensity}
      className={`${spaceGrotesk.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="bg-background font-sans text-foreground antialiased text-[15px] sm:text-base">
        <AppProviders
          initialHost={host}
          initialTenant={initialTenant}
          initialPreset={initialPreset}
          initialDensity={initialDensity}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
