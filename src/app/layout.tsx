import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/hooks/use-auth';
import AppLayout from '@/components/AppLayout';

export const metadata: Metadata = {
  title: 'Luminiktyo',
  description: 'Unlock your potential with expert mentorship.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
        {/*
          Inline critical style — injected before any JS loads so there is NEVER
          a frame where the background is white on mobile.
          #fffdf4 matches the top stop of hero-mentors-bg and the warm-white
          used throughout the app, so the flash colour blends in rather than
          jarring against it.
        */}
        <style dangerouslySetInnerHTML={{ __html: `
        html {
          overflow-x: clip;        /* horizontal only */
        }
        html, body {
          background-color: #fffdf4 !important;
          min-height: 100%;
          min-height: 100dvh;
          /* NEVER set overflow: hidden or height: 100% on both — it kills scroll */
        }
        body {
          overscroll-behavior-y: none;
        }
      `}} />
      </head>
      <body
        className="font-body antialiased"
        style={{ backgroundColor: '#fffdf4' }}
        suppressHydrationWarning
      >
        <AuthProvider>
          <AppLayout >
            {children}
          </AppLayout>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}