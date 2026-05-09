'use client';

// src/components/AccountFrozenOverlay.tsx
// Renders a full-screen blur overlay when the user's account is frozen.
// The user can still log out but cannot interact with any page content.

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Mail, LogOut } from 'lucide-react';

export function AccountFrozenOverlay() {
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0,0,0,0.55)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-5">
          <ShieldAlert className="w-8 h-8 text-red-600" />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Frozen</h1>

        {/* Body */}
        <p className="text-gray-600 text-sm leading-relaxed mb-4">
          Your account has been temporarily frozen due to a report filed against you.
          You cannot access any features until the issue is resolved by our admin team.
        </p>

        {/* Contact block */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6 text-left">
          <p className="text-sm font-semibold text-amber-900 mb-1 flex items-center gap-2">
            <Mail className="w-4 h-4" /> Need assistance?
          </p>
          <p className="text-sm text-amber-800">
            Please contact us at{' '}
            <a
              href="mailto:luminiktyo@gmail.com"
              className="font-semibold underline hover:text-amber-900 transition-colors"
            >
              luminiktyo@gmail.com
            </a>{' '}
            for support and to appeal this decision.
          </p>
        </div>

        {/* Logout */}
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors gap-2"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}