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

    // Handle routing protection and redirects
    useEffect(() => {
        console.log('AppLayout - Navigation Effect:', {
            isAuthLoading,
            userExists: !!user,
            userRole: user?.role,
            currentPath: pathname
        });
        
        // Wait for auth to finish loading
        if (isAuthLoading) return;

        // List of all public paths that should never redirect
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

        // List of shared private routes that both mentee and mentor can access
        const sharedPrivateRoutes = [
            '/mentor-listing' 
        ];
        
        // Never redirect on public paths
        if (publicPaths.includes(pathname)) {
            return;
        }

        // Check if current path is a private route
        const isPrivateRoute = (
            pathname.startsWith('/mentee/') ||
            pathname.startsWith('/mentor/') ||
            pathname.startsWith('/staff/') ||
            sharedPrivateRoutes.some(route => pathname.startsWith(route))
        );

        // If trying to access private route while not logged in, redirect to login
        if (!user && isPrivateRoute) {
            console.log('🔄 REDIRECT: To login - private route access attempt without auth');
            console.log('📍 Current path:', pathname);
            router.push('/login');
            return;
        }

        // If logged in and trying to access wrong role's route (excluding shared routes)
        if (user && user.role && isPrivateRoute) {
            const isSharedRoute = sharedPrivateRoutes.some(route => pathname.startsWith(route));
            
            console.log('🔍 Route check:', {
                pathname,
                isSharedRoute,
                sharedPrivateRoutes,
                userRole: user.role
            });
            
            if (!isSharedRoute) {
                const currentRolePrefix = `/${user.role}/`;
                const isWrongRole = !pathname.startsWith(currentRolePrefix);

                if (isWrongRole) {
                    console.log('🔄 REDIRECT: Wrong role access attempt');
                    const dashboardPath = user.role === 'mentee' ? '/mentee/mentor-listing' : 
                                        user.role === 'mentor' ? '/mentor/mentor-listing' : 
                                        `${currentRolePrefix}dashboard`;
                    console.log('📍 Redirecting to:', dashboardPath);
                    router.push(dashboardPath);
                }
            }
        }
    }, [user, isAuthLoading, pathname, router]);

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
    
    const staffPrivateRoutes = [
        '/staff/dashboard'
    ];

    if (isAuthLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    const isMenteePrivateRoute = menteePrivateRoutes.some(route => pathname.startsWith(route));
    const isMentorPrivateRoute = mentorPrivateRoutes.some(route => pathname.startsWith(route));
    const isStaffPrivateRoute = staffPrivateRoutes.some(route => pathname.startsWith(route));

    // Log values for debugging
    console.log("AppLayout Debug:");
    console.log("User:", user);
    console.log("Pathname:", pathname);
    console.log("User Role (if exists):", user?.role);
    console.log("Is Mentee Private Route:", isMenteePrivateRoute);
    console.log("Is Mentor Private Route:", isMentorPrivateRoute);
    console.log("Is Staff Private Route:", isStaffPrivateRoute);

    const showPrivateHeader = user && (
        (user.role === 'mentor' && pathname.startsWith('/mentor/')) ||
        (user.role === 'staff' && pathname.startsWith('/staff/'))
    );

    console.log("Show Private Header:", showPrivateHeader);

    // Don't show any header for mentee routes as they have their own sidebar layout
    // Also don't show header for internal/admin routes and forgot-password page
    const showHeader = !pathname.startsWith('/mentee/') && !pathname.startsWith('/mentor-listing') && !pathname.startsWith('/internal/') && !pathname.startsWith('/forgot-password');

    return (
        <>
            {showHeader && <Header />}
            <main>{children}</main>
        </>
    );
}