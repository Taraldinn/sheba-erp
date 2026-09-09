import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Space_Grotesk } from 'next/font/google';
import { cn } from '@/lib/cn';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={cn('font-sans', spaceGrotesk.variable)} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sheba-theme')||'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.add(t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex flex-col min-h-screen bg-background text-foreground antialiased selection:bg-indigo-500 selection:text-white">
        <RootProvider
          theme={{
            defaultTheme: 'dark',
            storageKey: 'sheba-theme',
            attribute: 'class',
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
