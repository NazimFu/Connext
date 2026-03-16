'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle2, Mail, Loader2 } from 'lucide-react';

export default function MentorVerificationPendingPage() {
    const { user, isAuthLoading, logout } = useAuth();
    const router = useRouter();

    useEffect(() => {
        // If user is verified and authenticated, redirect to dashboard
        if (!isAuthLoading && user && user.verificationStatus === 'approved') {
            router.push('/mentor/tasks');
        }
    }, [user, isAuthLoading, router]);

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    if (isAuthLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40">
                <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 md:px-6 py-12 bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40">
            <div className="w-full max-w-2xl">
                <Card className="border-amber-100">
                    <CardHeader className="text-center space-y-4 pb-8">
                        <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
                            <Clock className="w-8 h-8 text-amber-600" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl md:text-3xl font-bold text-gray-900">
                                Verification Submitted!
                            </CardTitle>
                            <CardDescription className="text-base mt-2">
                                Your mentor application is under review
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-6">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 space-y-4">
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold text-gray-900">Application Received</p>
                                    <p className="text-sm text-gray-600 mt-1">
                                        We've received your mentor application and our admin team is reviewing it.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Mail className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold text-gray-900">Email Notification</p>
                                    <p className="text-sm text-gray-600 mt-1">
                                        You'll receive an email at <span className="font-medium text-amber-700">{user?.email}</span> once your application is approved.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-6 space-y-3">
                            <h3 className="font-semibold text-gray-900">What happens next?</h3>
                            <ul className="space-y-2 text-sm text-gray-600">
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-600 font-bold mt-0.5">1.</span>
                                    <span>Our admin team will review your mentor profile and credentials</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-600 font-bold mt-0.5">2.</span>
                                    <span>You'll receive an email notification once approved</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-600 font-bold mt-0.5">3.</span>
                                    <span>After approval, you can start mentoring and scheduling sessions</span>
                                </li>
                            </ul>
                        </div>

                        <div className="pt-4 text-center space-y-4">
                            <p className="text-sm text-gray-500">
                                Verification typically takes 24-48 hours
                            </p>
                            <Button
                                variant="outline"
                                onClick={handleLogout}
                                className="w-full md:w-auto"
                            >
                                Logout
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
