'use client';

// src/app/mentee/layout.tsx
// FIX: background applied to html/body via root layout, and to every layer here
// so there is no white flash on mobile during route transitions.

import React, { useState, useTransition, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  CheckSquare,
  Users,
  Calendar,
  User,
  LogOut,
  X,
  Menu,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AccountFrozenOverlay } from '@/components/AccountFrozenOverlay';

const navigationItems = [
  { title: 'To-Do',          url: '/mentee/notices',        icon: CheckSquare },
  { title: 'Browse Mentors', url: '/mentee/mentor-listing', icon: Users },
  { title: 'Schedulings',    url: '/mentee/dashboard',      icon: Calendar },
  { title: 'My Profile',     url: '/mentee/profile/edit',   icon: User },
];

const pagesWithoutSidebar = [
  '/mentee/forms',
  '/mentee/verification',
  '/mentee/verification-pending',
];

// The warm-yellow background used everywhere — must match root layout's
// background-color so there's never a colour mismatch during navigation.
const APP_BG = '#fffdf4';

export default function MenteeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, refreshUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [meetingStarted, setMeetingStarted] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const checkMeetingAndFeedbackStatus = useCallback(async () => {
    if (!user?.id) return;
    const tokenCycle = user?.token_cycle;
    if (!tokenCycle || tokenCycle.status !== 'pending') {
      setMeetingStarted(false); setFeedbackSubmitted(false); return;
    }
    if (tokenCycle.feedbackSubmittedAt && tokenCycle.feedbackValid) {
      setFeedbackSubmitted(true); setMeetingStarted(true); return;
    }
    if (tokenCycle.meetingDate && tokenCycle.meetingTime) {
      try {
        const { convertMeetingTime } = await import('@/lib/timezone');
        const { utcDate } = convertMeetingTime(tokenCycle.meetingDate, tokenCycle.meetingTime, 'Asia/Kuala_Lumpur');
        const now = new Date();
        const twoHoursAfter = new Date(utcDate.getTime() + 2 * 60 * 60 * 1000);
        const hasStarted = now >= twoHoursAfter;
        setMeetingStarted(hasStarted);
        if (hasStarted) {
          try {
            const res = await fetch(`/api/token-cycle/status?userId=${user.id}&_t=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
            if (res.ok) { const d = await res.json(); setFeedbackSubmitted(!!(d.tokenCycle?.feedbackSubmittedAt && d.tokenCycle?.feedbackValid)); }
          } catch { setFeedbackSubmitted(!!(tokenCycle.feedbackSubmittedAt && tokenCycle.feedbackValid)); }
        } else { setFeedbackSubmitted(false); }
      } catch { setMeetingStarted(false); setFeedbackSubmitted(false); }
    } else { setMeetingStarted(false); setFeedbackSubmitted(false); }
  }, [user?.id, user?.token_cycle]);

  useEffect(() => {
    checkMeetingAndFeedbackStatus();
    const id = setInterval(checkMeetingAndFeedbackStatus, 60_000);
    return () => clearInterval(id);
  }, [checkMeetingAndFeedbackStatus]);

  // Close sidebar on navigation
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);

  const shouldHideSidebar = pagesWithoutSidebar.some(p => pathname.startsWith(p));

  const handleLogout = async () => {
    try { await logout(); window.location.href = '/'; } catch { window.location.href = '/'; }
  };

  const isActive = (url: string) => {
    if (url === '/mentee/dashboard') return pathname === url || pathname.startsWith('/mentee/dashboard');
    return pathname === url || pathname.startsWith(url);
  };

  if (shouldHideSidebar) return <>{children}</>;

  const tokenCycle = user?.token_cycle;
  const tokenCycleStatus = tokenCycle?.status;
  let daysRemainingInCycle: number | null = null;
  if (tokenCycleStatus === 'pending' && tokenCycle) {
    const tokenUsedAt = tokenCycle.tokenUsedAt ? new Date(tokenCycle.tokenUsedAt) : null;
    if (tokenUsedAt && !Number.isNaN(tokenUsedAt.getTime())) {
      const cooldownEnd = new Date(tokenUsedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      daysRemainingInCycle = Math.max(0, Math.ceil((cooldownEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    }
  }
  const showFeedbackNudge = tokenCycleStatus === 'pending' && meetingStarted && !feedbackSubmitted;

  return (
    /*
      KEY FIX: background-color set directly on the outermost element with
      style prop (not just Tailwind class) so it is present even before the
      CSS bundle is parsed — this eliminates the white flash on mobile.
    */
    <div
      className="min-h-dvh flex w-full"
      style={{ backgroundColor: APP_BG }}
    >
      {(user as any)?.accountFrozen && <AccountFrozenOverlay />}

      <style jsx global>{`
        :root {
          --primary: 45 93% 47%;
          --primary-foreground: 0 0% 100%;
          --accent: 48 96% 53%;
          --accent-foreground: 0 0% 0%;
        }
        /* Reinforce background on html/body in case globals.css is slow */
        html, body { background-color: ${APP_BG} !important; }
      `}</style>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-yellow-100/50 bg-white/95 backdrop-blur-md',
          'fixed left-0 top-0 h-screen z-50 w-72',
          'transition-transform duration-300 ease-in-out shadow-2xl',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="border-b border-yellow-100/50 p-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="Connext logo" className="h-10 w-10 rounded-xl object-contain bg-white shadow-lg shadow-yellow-500/20" />
            <div>
              <img src="/name.jpg" alt="Connext" className="h-5 w-auto block leading-none rounded-lg" />
              <p className="text-xs text-gray-500 mt-0.5">&nbsp;&nbsp;&nbsp;Mentee Portal</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          <ul className="space-y-1">
            {navigationItems.map((item) => (
              <li key={item.title}>
                <Link
                  href={item.url}
                  prefetch={true}
                  onClick={() => { startTransition(() => {}); refreshUser(); }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group',
                    isActive(item.url)
                      ? 'bg-gradient-to-r from-yellow-50 to-amber-50 text-amber-700 shadow-sm'
                      : 'hover:bg-yellow-50 hover:text-amber-700 text-gray-700'
                  )}
                >
                  <item.icon className={cn('w-5 h-5 transition-transform duration-200 group-hover:scale-110 flex-shrink-0', isActive(item.url) ? 'text-amber-600' : 'text-gray-500')} />
                  <span className="font-medium text-sm">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-yellow-100/50 p-4 flex-shrink-0">
          {user && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-1">
                <div className="w-9 h-9 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center text-white font-semibold shadow-md flex-shrink-0 text-sm">
                  {user.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{user.name || 'User'}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
              </div>

              <div className="relative group">
                <div className="flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 via-yellow-50 to-amber-100 rounded-xl px-4 py-2 shadow text-gray-900 border border-yellow-200 hover:border-yellow-400 transition-all duration-200 cursor-pointer">
                  <span className="font-extrabold text-lg tracking-tight">{user.tokens ?? 0}</span>
                  <span className="text-sm font-bold text-amber-700">Tokens</span>
                  {tokenCycleStatus === 'pending' && (
                    <div className="mt-1 w-full space-y-0.5">
                      {daysRemainingInCycle !== null && (
                        <span className="text-[11px] font-medium text-amber-700 text-center block">
                          Replenishes in {daysRemainingInCycle} day{daysRemainingInCycle !== 1 ? 's' : ''}
                        </span>
                      )}
                      {showFeedbackNudge && (
                        <span className="text-[11px] font-semibold text-orange-600 text-center block">
                          Fill feedback to recover token
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {tokenCycleStatus === 'pending'
                    ? showFeedbackNudge ? 'Submit feedback to unlock token replenishment.' : `Token replenishes in ${daysRemainingInCycle ?? '?'} day(s).`
                    : 'This token is for meeting requests'}
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={handleLogout} className="w-full justify-start gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors text-sm">
                <LogOut className="w-4 h-4" />Logout
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content — also gets the background so no flash between sidebar and content */}
      <main
        className="flex-1 flex flex-col min-w-0 min-h-dvh"
        style={{ backgroundColor: APP_BG }}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-yellow-100/50 px-4 py-3 flex items-center gap-3 shadow-sm" style={{ backgroundColor: 'rgba(255,253,244,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-yellow-50 transition-colors text-gray-600"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="Connext logo" className="h-7 w-7 rounded-lg object-contain bg-white shadow-sm" />
            <img src="/name.jpg" alt="Connext" className="h-4 w-auto hidden sm:block rounded-md" />
          </div>

          {user && (
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-full px-3 py-1 shadow-sm">
                <span className="font-extrabold text-sm text-amber-700">{user.tokens ?? 0}</span>
                <span className="text-xs font-medium text-amber-600">tokens</span>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-md">
                {user.name?.[0]?.toUpperCase() || 'U'}
              </div>
            </div>
          )}
        </header>

        {isPending && (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(255,253,244,0.8)', backdropFilter: 'blur(4px)' }}>
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
              <p className="text-sm font-medium text-gray-600">Loading...</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto" style={{ backgroundColor: APP_BG }}>
          {children}
        </div>
      </main>
    </div>
  );
}