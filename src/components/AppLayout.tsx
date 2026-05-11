'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import Header from '@/components/header';
import { Loader2 } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthLoading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    // Single useEffect — all hooks must come before any early returns
    useEffect(() => {
        // Skip all redirect logic for homepage and public paths
        if (pathname === '/') return;

        console.log('AppLayout - Navigation Effect:', {
            isAuthLoading,
            userExists: !!user,
            userRole: user?.role,
            currentPath: pathname
        });

        if (isAuthLoading) return;

        const publicPaths = [
            '/',
            '/login',
            '/signup',
            '/signup/mentor_secret',
            '/mentor/forms',
            '/mentee/forms',
            '/mentee/verification',
            '/mentee/verification-pending'
        ];

        const sharedPrivateRoutes = ['/mentor-listing'];

        if (publicPaths.includes(pathname)) return;

        const isPrivateRoute = (
            pathname.startsWith('/mentee/') ||
            pathname.startsWith('/mentor/') ||
            pathname.startsWith('/staff/') ||
            sharedPrivateRoutes.some(route => pathname.startsWith(route))
        );

        if (!user && isPrivateRoute) {
            router.push('/login');
            return;
        }

        if (user && user.role && isPrivateRoute) {
            const isSharedRoute = sharedPrivateRoutes.some(route => pathname.startsWith(route));

            if (!isSharedRoute) {
                const currentRolePrefix = `/${user.role}/`;
                const isWrongRole = !pathname.startsWith(currentRolePrefix);

                if (isWrongRole) {
                    const dashboardPath = user.role === 'mentee' ? '/mentee/mentor-listing' :
                                        user.role === 'mentor' ? '/mentor/mentor-listing' :
                                        `${currentRolePrefix}dashboard`;
                    router.push(dashboardPath);
                }
            }
        }
    }, [user, isAuthLoading, pathname, router]);

    // ── Early returns come AFTER all hooks ──

    // Homepage is fully self-contained — no spinner, no header, no wrapper
    if (pathname === '/') {
        return <>{children}</>;
    }

    if (isAuthLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    const menteePrivateRoutes = [
        '/mentee/notices',
        '/mentee/profile/edit',
        '/mentee/schedule',
        '/mentor-listing',
        '/mentee/verification',
        '/mentee/verified'
    ];

    const mentorPrivateRoutes = [
        '/mentor/dashboard',
        '/mentor/availability',
        '/mentor-listing',
        '/mentor/meeting-requests'
    ];

    const staffPrivateRoutes = ['/staff/dashboard'];

    const isMenteePrivateRoute = menteePrivateRoutes.some(route => pathname.startsWith(route));
    const isMentorPrivateRoute = mentorPrivateRoutes.some(route => pathname.startsWith(route));
    const isStaffPrivateRoute = staffPrivateRoutes.some(route => pathname.startsWith(route));

    const showHeader = !pathname.startsWith('/mentee/') &&
                       !pathname.startsWith('/mentor/') &&
                       !pathname.startsWith('/mentor-listing') &&
                       !pathname.startsWith('/internal/') &&
                       !pathname.startsWith('/forgot-password');

    return (
        <>
            {showHeader && <Header />}
            <main>{children}</main>
        </>
    );
}