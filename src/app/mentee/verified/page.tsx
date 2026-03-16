'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequireAuth, useAuth } from "@/hooks/use-auth";
import { Loader2, PartyPopper } from "lucide-react";
import { Button } from '@/components/ui/button';

export default function VerifiedPage() {
    const { isLoading } = useRequireAuth('mentee', { verificationStatus: 'just-approved' });
    const { acknowledgeVerification } = useAuth();
    const router = useRouter();

    const handleGoToDashboard = () => {
        acknowledgeVerification();
        router.push('/mentee/dashboard');
    };

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="container mx-auto px-4 md:px-6 py-12 flex justify-center">
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <div className="mx-auto bg-green-100 rounded-full p-3 w-fit">
                       <PartyPopper className="h-10 w-10 text-green-600" />
                    </div>
                    <CardTitle className="mt-4">Verification Successful!</CardTitle>
                    <CardDescription>
                        Welcome to Luminiktyo! Your account has been approved. Click the button below to proceed to your dashboard.
                    </CardDescription>
                </CardHeader>
                 <CardContent>
                    <Button onClick={handleGoToDashboard} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                        Go to Dashboard
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
