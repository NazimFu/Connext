'use client';

// src/app/mentee/layout.tsx
// CHANGED: imports AccountFrozenOverlay and renders it when user.accountFrozen === true

import React, { useState, useTransition, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { 
  CheckSquare, 
  Users, 
  Calendar, 
  User, 
  LogOut, 
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AccountFrozenOverlay } from '@/components/AccountFrozenOverlay'; // ← NEW

const navigationItems = [
  {
    title: 'To-Do',
    url: '/mentee/notices',
    icon: CheckSquare,
  },
  {
    title: 'Browse Mentors',
    url: '/mentee/mentor-listing',
    icon: Users,
  },
  {
    title: 'Schedulings',
    url: '/mentee/dashboard',
    icon: Calendar,
  },
  {
    title: 'My Profile',
    url: '/mentee/profile/edit',
    icon: User,
  },
];

const pagesWithoutSidebar = [
  '/mentee/forms',
  '/mentee/verification',
  '/mentee/verification-pending',
];

export default function MenteeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [meetingStarted, setMeetingStarted] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const checkMeetingAndFeedbackStatus = useCallback(async () => {
    if (!user?.id) return;

    const tokenCycle = user?.token_cycle;
    if (!tokenCycle || tokenCycle.status !== 'pending') {
      setMeetingStarted(false);
      setFeedbackSubmitted(false);
      return;
    }

    if (tokenCycle.feedbackSubmittedAt && tokenCycle.feedbackValid) {
      setFeedbackSubmitted(true);
      setMeetingStarted(true);
      return;
    }

    if (tokenCycle.meetingDate && tokenCycle.meetingTime) {
      try {
        const { convertMeetingTime } = await import('@/lib/timezone');
        const { utcDate } = convertMeetingTime(
          tokenCycle.meetingDate,
          tokenCycle.meetingTime,
          'Asia/Kuala_Lumpur'
        );
        const now = new Date();
        const twoHoursAfterMeeting = new Date(utcDate.getTime() + 2 * 60 * 60 * 1000);
        const hasStarted = now >= twoHoursAfterMeeting;
        setMeetingStarted(hasStarted);

        if (hasStarted) {
          try {
            const ts = Date.now();
            const res = await fetch(`/api/token-cycle/status?userId=${user.id}&_t=${ts}`, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache' }
            });
            if (res.ok) {
              const data = await res.json();
              const cycle = data.tokenCycle;
              const submitted = !!(cycle?.feedbackSubmittedAt && cycle?.feedbackValid);
              setFeedbackSubmitted(submitted);
            }
          } catch {
            setFeedbackSubmitted(
              !!(tokenCycle.feedbackSubmittedAt && tokenCycle.feedbackValid)
            );
          }
        } else {
          setFeedbackSubmitted(false);
        }
      } catch {
        setMeetingStarted(false);
        setFeedbackSubmitted(false);
      }
    } else {
      setMeetingStarted(false);
      setFeedbackSubmitted(false);
    }
  }, [user?.id, user?.token_cycle]);

  useEffect(() => {
    checkMeetingAndFeedbackStatus();
    const interval = setInterval(checkMeetingAndFeedbackStatus, 60 * 1000);
    return () => clearInterval(interval);
  }, [checkMeetingAndFeedbackStatus]);

  const shouldHideSidebar = pagesWithoutSidebar.some(path => pathname.startsWith(path));

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/';
    }
  };

  const isActive = (url: string) => {
    if (url === '/mentee/dashboard') {
      return pathname === url || pathname.startsWith('/mentee/dashboard');
    }
    return pathname === url || pathname.startsWith(url);
  };

  if (shouldHideSidebar) {
    return <>{children}</>;
  }

  const tokenCycle = user?.token_cycle;
  const tokenCycleStatus = tokenCycle?.status;

  let daysRemainingInCycle: number | null = null;

  if (tokenCycleStatus === 'pending' && tokenCycle) {
    const now = new Date();
    const tokenUsedAt = tokenCycle.tokenUsedAt ? new Date(tokenCycle.tokenUsedAt) : null;
    if (tokenUsedAt && !Number.isNaN(tokenUsedAt.getTime())) {
      const cooldownEnd = new Date(tokenUsedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      const msRemaining = cooldownEnd.getTime() - now.getTime();
      daysRemainingInCycle = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    }
  }

  const showFeedbackNudge =
    tokenCycleStatus === 'pending' &&
    meetingStarted &&
    !feedbackSubmitted;

  return (
    <div className="min-h-screen flex w-full bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40">
      {/* ── ACCOUNT FROZEN OVERLAY ─────────────────────────────────────────── */}
      {/* Renders on top of everything; user can only log out */}
      {(user as any)?.accountFrozen && <AccountFrozenOverlay />}

      <style jsx global>{`
        :root {
          --primary: 45 93% 47%;
          --primary-foreground: 0 0% 100%;
          --accent: 48 96% 53%;
          --accent-foreground: 0 0% 0%;
        }
      `}</style>

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-yellow-100/50 bg-white/80 backdrop-blur-md transition-all duration-300 ease-in-out fixed left-0 top-0 h-screen z-50',
          sidebarOpen ? 'w-64' : 'w-24 md:w-28'
        )}
      >
        {/* Sidebar Header */}
        <div className="border-b border-yellow-100/50 p-4 md:p-6 flex items-center justify-center flex-shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 group">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20 group-hover:shadow-yellow-500/30 transition-all duration-300">
                <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div className="hidden sm:block">
                <h2 className="font-bold text-lg md:text-xl text-gray-900">Connext</h2>
                <p className="text-xs text-gray-500">Connect & Grow</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
          )}
        </div>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-16 md:top-20 -right-3 w-6 h-6 bg-white border border-yellow-100/50 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-all z-10"
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          )}
        </button>

        <nav className="flex-1 p-2 md:p-3 overflow-y-auto">
          <ul className="space-y-1">
            {navigationItems.map((item) => (
              <li key={item.title}>
                <Link
                  href={item.url}
                  prefetch={true}
                  onClick={() => {
                    startTransition(() => {});
                    refreshUser();
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-2 md:px-4 py-3 rounded-xl transition-all duration-200 group',
                    isActive(item.url)
                      ? 'bg-gradient-to-r from-yellow-50 to-amber-50 text-amber-700 shadow-sm'
                      : 'hover:bg-yellow-50 hover:text-amber-700'
                  )}
                  title={!sidebarOpen ? item.title : undefined}
                >
                  <item.icon
                    className={cn(
                      'w-5 h-5 transition-transform duration-200 group-hover:scale-110 flex-shrink-0',
                      sidebarOpen ? 'mr-3' : 'mx-auto',
                      isActive(item.url) ? 'text-amber-600' : 'text-gray-500'
                    )}
                  />
                  {sidebarOpen && <span className="font-medium text-xs md:text-sm">{item.title}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-yellow-100/50 p-2 md:p-4 flex-shrink-0">
          {user && (
            <div className="space-y-2">
              {sidebarOpen ? (
                <>
                  <div className="flex items-center gap-2 md:gap-3 px-1 md:px-2">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center text-white font-semibold shadow-md flex-shrink-0 text-sm md:text-base">
                      {user.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0 hidden sm:block">
                      <p className="font-semibold text-gray-900 text-xs md:text-sm truncate">
                        {user.name || 'User'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="relative group mt-2">
                    <div className="flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 via-yellow-50 to-amber-100 rounded-xl px-4 py-2 shadow text-gray-900 border border-yellow-200 hover:border-yellow-400 transition-all duration-200 cursor-pointer">
                      <span className="font-extrabold text-lg tracking-tight drop-shadow-sm">{user.tokens ?? 0}</span>
                      <span className="text-base font-bold text-amber-700">Tokens</span>
                      {tokenCycleStatus === 'pending' && (
                        <div className="mt-1 w-full space-y-1">
                          {daysRemainingInCycle !== null && (
                            <span className="text-[11px] font-medium text-amber-700 text-center block">
                              Replenishes in {daysRemainingInCycle} day{daysRemainingInCycle !== 1 ? 's' : ''}
                            </span>
                          )}
                          {showFeedbackNudge && (
                            <span className="text-[11px] font-semibold text-orange-600 text-center block">
                              Fill feedback form to recover token
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                      {tokenCycleStatus === 'pending'
                        ? showFeedbackNudge
                          ? `Active cycle: Submit your feedback form to unlock token replenishment.`
                          : `Active cycle: Token replenishes in ${daysRemainingInCycle ?? '?'} day(s).`
                        : 'This token is for meeting requests'}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full justify-start gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors text-xs md:text-sm mt-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="relative group mt-2 w-full flex flex-col items-center justify-center">
                    <div className="flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 via-yellow-50 to-amber-100 rounded-xl px-4 py-2 shadow text-gray-900 border border-yellow-200 hover:border-yellow-400 transition-all duration-200 cursor-pointer">
                      <span className="font-extrabold text-lg tracking-tight drop-shadow-sm">{user.tokens ?? 0}</span>
                      <span className="text-base font-bold text-amber-700">Tokens</span>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-red-50 transition-colors"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5 text-red-600" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      <main
        className={cn(
          'flex-1 flex flex-col min-w-0 transition-all duration-300',
          sidebarOpen ? 'ml-64' : 'ml-16 md:ml-20'
        )}
      >
        {isPending && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
              <p className="text-sm font-medium text-gray-600">Loading...</p>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}