import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/hooks/use-auth';
import AppLayout from '@/components/AppLayout';

export const metadata: Metadata = {
  title: 'Connext',
  description: 'Unlock your potential with expert mentorship.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light preload" suppressHydrationWarning>
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
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
        {/*
          Inline critical style — injected before any JS loads so there is NEVER
          a frame where the background is white on mobile.
          #fffdf4 matches the top stop of hero-mentors-bg and the warm-white
          used throughout the app, so the flash colour blends in rather than
          jarring against it.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var doc = document.documentElement;
                var hydrationTimeout;
                var onHydrate = function () {
                  doc.classList.remove('preload');
                  doc.classList.add('ready');
                  clearTimeout(hydrationTimeout);
                  window.removeEventListener('__react-hydration-done', onHydrate);
                };
                window.addEventListener('__react-hydration-done', onHydrate);
                hydrationTimeout = setTimeout(onHydrate, 2500);
              })();
            `,
          }}
        />
        <style dangerouslySetInnerHTML={{ __html: `
        html.preload body {
          visibility: hidden;
          opacity: 0;
          pointer-events: none;
        }
        html.ready body {
          visibility: visible;
          opacity: 1;
          pointer-events: auto;
          transition: opacity 0.1s ease;
        }
        html {
          overflow-x: clip;
          overflow-y: auto;
        }
        html, body {
          margin: 0;
          background-color: #fffdf4 !important;
          min-height: 100%;
        }
        body {
          overflow-y: visible;
          overscroll-behavior-y: auto;
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