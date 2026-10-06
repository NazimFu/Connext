'use client';

// Lightweight notification bell used in the mentor/mentee header.
// On sign-in, a brief reminder toast appears next to the bell, then shrinks
// away "into" the bell icon, leaving an unread badge the user can open later.

import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
}

// Set by the login page right after a successful sign-in.
export const JUST_SIGNED_IN_KEY = 'justSignedIn';
export const GOOGLE_REMINDER_UNREAD_KEY = 'google_reminder_unread';

const GOOGLE_REMINDER: NotificationItem = {
  id: 'google-meet-reminder',
  title: 'Google Meet reminder',
  message: "Mentoring sessions are hosted on Google Meet — make sure you can sign in to a Google account using your registered email before joining.",
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [popupVisible, setPopupVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unread = false;
    try { unread = sessionStorage.getItem(GOOGLE_REMINDER_UNREAD_KEY) === '1'; } catch {}
    if (unread) {
      setNotifications([GOOGLE_REMINDER]);
      setHasUnread(true);
    }

    let justSignedIn = false;
    try { justSignedIn = sessionStorage.getItem(JUST_SIGNED_IN_KEY) === '1'; } catch {}
    if (justSignedIn) {
      try { sessionStorage.removeItem(JUST_SIGNED_IN_KEY); } catch {}
      setNotifications([GOOGLE_REMINDER]);
      setHasUnread(true);
      setPopupVisible(true);
      const timer = setTimeout(() => setPopupVisible(false), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleDropdown = () => {
    setPopupVisible(false);
    setDropdownOpen(prev => !prev);
    setHasUnread(false);
    try { sessionStorage.removeItem(GOOGLE_REMINDER_UNREAD_KEY); } catch {}
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggleDropdown}
        aria-label="Notifications"
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-yellow-50 transition-colors text-gray-600"
      >
        <Bell className="w-5 h-5" />
        {hasUnread && notifications.length > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none animate-pulse">
            {notifications.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {popupVisible && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.15, y: -20, x: 20 }}
            transition={{ duration: 0.45, ease: 'easeInOut' }}
            style={{ transformOrigin: 'top right' }}
            className="absolute top-full right-0 mt-2 w-72 rounded-xl border border-amber-200 bg-white shadow-xl p-3.5 z-50"
          >
            <p className="text-sm font-semibold text-gray-900 mb-1">{GOOGLE_REMINDER.title}</p>
            <p className="text-xs text-gray-600 leading-relaxed">{GOOGLE_REMINDER.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dropdownOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-72 rounded-xl border border-gray-200 bg-white shadow-xl z-50 overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-gray-100 font-semibold text-sm text-gray-900">
              Notifications
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">No notifications</div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {notifications.map((n) => (
                  <div key={n.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 mb-0.5">{n.title}</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
