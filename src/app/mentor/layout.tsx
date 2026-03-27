'use client';

import React, { useState, useTransition } from 'react';
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
  Search,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navigationItems = [
  {
    title: 'Tasks',
    url: '/mentor/tasks',
    icon: CheckSquare,
  },
  {
    title: 'Sessions',
    url: '/mentor/meeting-requests',
    icon: Calendar,
  },
  {
    title: 'My Mentees',
    url: '/mentor/mentees',
    icon: Users,
  },
  {
    title: 'Browse Mentors',
    url: '/mentor/mentor-listing',
    icon: Search,
  },
  {
    title: 'My Profile',
    url: '/mentor/profile/edit',
    icon: User,
  },
];

// Pages that should not show the sidebar
const pagesWithoutSidebar = [
  '/mentor/forms',
  '/mentor/verification-pending',
];

export default function MentorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Check if current page should hide sidebar
  const shouldHideSidebar = pagesWithoutSidebar.some(path => pathname.startsWith(path));

  const handleLogout = async () => {
    try {
      await logout();
      // Force navigation to home page after logout
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      // Still redirect even if there's an error
      window.location.href = '/';
    }
  };

  const isActive = (url: string) => {
    return pathname === url || pathname.startsWith(url);
  };

  // If sidebar should be hidden, just render children
  if (shouldHideSidebar) {
    return <>{children}</>;
  }

  const tokenCycleStatus = user?.token_cycle?.status;
  const pendingReplenishText =
    tokenCycleStatus === 'pending'
      ? (user?.tokenReplenishAt
          ? new Date(user.tokenReplenishAt).toLocaleString()
          : 'soon')
      : null;

  return (
    <div className="min-h-screen flex w-full bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40">
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
                <p className="text-xs text-gray-500">Mentor Portal</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
          )}
        </div>

        {/* Toggle Button */}
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

        {/* Navigation */}
        <nav className="flex-1 p-2 md:p-3 overflow-y-auto">
          <ul className="space-y-1">
            {navigationItems.map((item) => (
              <li key={item.title}>
                <Link
                  href={item.url}
                  prefetch={true}
                  onClick={() => startTransition(() => {})}
                  className={cn(
                    sidebarOpen
                      ? 'w-full flex items-center gap-3 px-2 md:px-4 py-3 rounded-xl transition-all duration-200 group'
                      : 'w-full flex items-center justify-center py-4 rounded-xl transition-all duration-200 group',
                    isActive(item.url)
                      ? 'bg-gradient-to-r from-yellow-50 to-amber-50 text-amber-700 shadow-sm'
                      : 'hover:bg-yellow-50 hover:text-amber-700'
                  )}
                  title={!sidebarOpen ? item.title : undefined}
                >
                  <item.icon
                    className={cn(
                      'w-5 h-5 transition-transform duration-200 group-hover:scale-110 flex-shrink-0',
                      isActive(item.url) ? 'text-amber-600' : 'text-gray-500',
                      !sidebarOpen && 'mx-auto'
                    )}
                  />
                  {sidebarOpen && <span className="font-medium text-xs md:text-sm">{item.title}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Footer with Tokens */}
        <div className="border-t border-yellow-100/50 p-2 md:p-4 flex-shrink-0">
          {user && (
            <div className="space-y-2">
              {sidebarOpen ? (
                <>
                  <div className="flex items-center gap-2 md:gap-3 px-1 md:px-2">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center text-white font-semibold shadow-md flex-shrink-0 text-sm md:text-base">
                      {user.name?.[0]?.toUpperCase() || 'M'}
                    </div>
                    <div className="flex-1 min-w-0 hidden sm:block">
                      <p className="font-semibold text-gray-900 text-xs md:text-sm truncate">
                        {user.name || 'Mentor'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  {/* Professional Tokens Card with Tooltip */}
                  <div className="relative group mt-2">
                    <div className="flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 via-yellow-50 to-amber-100 rounded-xl px-4 py-2 shadow text-gray-900 border border-yellow-200 hover:border-yellow-400 transition-all duration-200 cursor-pointer">
                      <span className="font-extrabold text-lg tracking-tight drop-shadow-sm">{user.tokens ?? 0}</span>
                      <span className="text-base font-bold text-amber-700">Tokens</span>
                      {tokenCycleStatus === 'pending' && (
                        <span className="mt-1 text-[11px] font-medium text-amber-700 text-center">
                          Cycle pending until {pendingReplenishText}
                        </span>
                      )}
                    </div>
                    {/* Tooltip */}
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-max px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                      {tokenCycleStatus === 'pending'
                        ? `Active cycle pending. Evaluates at ${pendingReplenishText}.`
                        : 'This token is for requesting meetings'}
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
                  {/* Consistent Token Card Style for Collapsed Sidebar */}
                  <div className="relative group mt-2 w-full flex flex-col items-center justify-center">
                    <div className="flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 via-yellow-50 to-amber-100 rounded-xl px-4 py-2 shadow text-gray-900 border border-yellow-200 hover:border-yellow-400 transition-all duration-200 cursor-pointer">
                      <span className="font-extrabold text-lg tracking-tight drop-shadow-sm">{user.tokens ?? 0}</span>
                      <span className="text-base font-bold text-amber-700">Tokens</span>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-max px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                      {tokenCycleStatus === 'pending'
                        ? `Active cycle pending. Evaluates at ${pendingReplenishText}.`
                        : 'This token is for requesting meetings'}
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

      {/* Main Content Area */}
      <main 
        className={cn(
          'flex-1 flex flex-col min-w-0 transition-all duration-300',
          sidebarOpen ? 'ml-64' : 'ml-24 md:ml-28'
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