'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { auth } from '../../../../lib/firebase';
import { Checkbox } from '@/components/ui/checkbox';

export default function VerificationPage() {
    const { user, isAuthLoading, refreshUser } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState('cv');
    const [cvFile, setCvFile] = useState<File | null>(null);
    const [essay, setEssay] = useState('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [allowCVShare, setAllowCVShare] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCheckingUser, setIsCheckingUser] = useState(false);
    
    // Verification code flow
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [profileData, setProfileData] = useState<any>({});
    const [showVerification, setShowVerification] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [signupId, setSignupId] = useState('');
    const [countdown, setCountdown] = useState(120);
    const [canResend, setCanResend] = useState(false);

    // Load credentials and profile data from sessionStorage
    useEffect(() => {
        const storedEmail = sessionStorage.getItem('signup_email');
        const storedPassword = sessionStorage.getItem('signup_password');
        const name = sessionStorage.getItem('profile_name');
        const age = sessionStorage.getItem('profile_age');
        const occupation = sessionStorage.getItem('profile_occupation');
        const institution = sessionStorage.getItem('profile_institution');
        const linkedin = sessionStorage.getItem('profile_linkedin');
        const github = sessionStorage.getItem('profile_github');
        
        if (!storedEmail || !storedPassword || !name) {
            router.push('/signup');
            return;
        }
        
        setEmail(storedEmail);
        setPassword(storedPassword);
        setProfileData({
            name,
            mentee_age: age || '',
            mentee_occupation: occupation || '',
            mentee_institution: institution || '',
            linkedin: linkedin || '',
            github: github || ''
        });
    }, [router]);
    
    // Countdown timer
    useEffect(() => {
        if (showVerification && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
        if (countdown === 0 && !canResend) {
            setCanResend(true);
        }
    }, [showVerification, countdown, canResend]);
    
    const formatCountdownTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            let cvPath = '';
            let personalStatement = '';
            
            if (essay) {
                const wordCount = essay.trim().split(/\s+/).filter(word => word.length > 0).length;
                if (wordCount < 50) {
                    toast({
                        variant: 'destructive',
                        title: 'Personal Statement Too Short',
                        description: `Your personal statement must be at least 50 words. Current count: ${wordCount} words.`,
                    });
                    setIsSubmitting(false);
                    return;
                }
                personalStatement = essay;
            }
            
            if (cvFile) {
                console.log('[MENTEE-VERIFY] Uploading CV file:', cvFile.name);
                const formData = new FormData();
                formData.append('file', cvFile);

                const uploadRes = await fetch('/api/uploadFirebase', {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadRes.ok) {
                    throw new Error('Failed to upload CV file');
                }

                const uploadData = await uploadRes.json();
                console.log('[MENTEE-VERIFY] Upload response:', uploadData);
                cvPath = uploadData.path;
                console.log('[MENTEE-VERIFY] CV path to be stored:', cvPath);
            }

            console.log('[MENTEE-VERIFY] Sending signup code with data:', {
                cv_link: cvPath,
                hasPersonalStatement: !!personalStatement
            });

            const response = await fetch('/api/auth/send-signup-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: profileData.name,
                    email,
                    password,
                    role: 'mentee',
                    mentee_age: profileData.mentee_age,
                    mentee_occupation: profileData.mentee_occupation,
                    mentee_institution: profileData.mentee_institution,
                    linkedin: profileData.linkedin,
                    github: profileData.github,
                    allowCVShare: allowCVShare,
                    cv_link: cvPath,
                    linkedin_url: linkedinUrl,
                    personal_statement: personalStatement
                }),
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to send verification code');
            }
            
            setSignupId(result.signupId);
            setShowVerification(true);
            setCountdown(120);
            setCanResend(false);
            
            toast({
                title: "Verification Code Sent!",
                description: "Please check your email for the verification code.",
            });

        } catch (error) {
            console.error('Submit error:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to send verification code',
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleVerifyCode = async () => {
        if (!verificationCode.trim() || verificationCode.length !== 4) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please enter the 4-digit verification code.",
            });
            return;
        }
        
        setIsVerifying(true);
        
        try {
            // Step 1: Verify the code
            const response = await fetch('/api/auth/verify-signup-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signupId,
                    code: verificationCode.trim()
                }),
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to verify code');
            }
            
            // Step 2: Create Firebase authentication account
            const { auth } = await import('@/lib/firebase');
            const { createUserWithEmailAndPassword, signOut } = await import('firebase/auth');
            
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            if (!userCredential.user?.uid) {
                throw new Error('Failed to create user account');
            }
            
            const uid = userCredential.user.uid;
            console.log('Firebase account created:', uid);

            // Step 3: Create mentee profile in database
            const profileResponse = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: uid,
                    email: email,
                    role: 'mentee',
                    name: result.data?.name || profileData.name,
                    mentee_age: result.data?.mentee_age || profileData.mentee_age,
                    mentee_occupation: result.data?.mentee_occupation || profileData.mentee_occupation,
                    mentee_institution: result.data?.mentee_institution || profileData.mentee_institution,
                    linkedin: result.data?.linkedin || profileData.linkedin,
                    github: result.data?.github || profileData.github,
                    cv_link: result.data?.cv_link || result.data?.attachmentPath || '',
                    allowCVShare: result.data?.allowCVShare || false,
                    linkedin_url: result.data?.linkedin_url || '',
                    personal_statement: result.data?.personal_statement || ''
                }),
            });
            
            if (!profileResponse.ok) {
                const errorData = await profileResponse.json();
                throw new Error(errorData.message || 'Failed to create mentee profile');
            }
            
            console.log('Mentee profile created successfully');

            // Step 4: IMMEDIATELY sign out so onAuthStateChanged does NOT fire and
            // redirect the user away from verification-pending. The user is not
            // approved yet — they should land on verification-pending only.
            await signOut(auth);
            console.log('Signed out after account creation to prevent auth redirect');
            
            // Step 5: Clear sessionStorage
            sessionStorage.removeItem('signup_email');
            sessionStorage.removeItem('signup_password');
            sessionStorage.removeItem('profile_name');
            sessionStorage.removeItem('profile_age');
            sessionStorage.removeItem('profile_occupation');
            sessionStorage.removeItem('profile_institution');
            sessionStorage.removeItem('profile_linkedin');
            sessionStorage.removeItem('profile_github');
            
            toast({
                title: "Account Created!",
                description: "Your account has been created. Please wait for verification approval.",
            });
            
            // Step 6: Navigate directly — auth state is cleared so nothing can hijack this
            router.push('/mentee/verification-pending');

        } catch (error) {
            console.error('Failed to verify code:', error);
            toast({
                variant: "destructive",
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to verify code.",
            });
        } finally {
            setIsVerifying(false);
        }
    };
    
    const handleResendCode = async () => {
        setIsSubmitting(true);
        try {
            let cvPath = '';
            let personalStatement = '';
            
            if (essay) {
                const wordCount = essay.trim().split(/\s+/).filter(word => word.length > 0).length;
                if (wordCount < 50) {
                    toast({
                        variant: 'destructive',
                        title: 'Personal Statement Too Short',
                        description: `Your personal statement must be at least 50 words. Current count: ${wordCount} words.`,
                    });
                    setIsSubmitting(false);
                    return;
                }
                personalStatement = essay;
            }
            
            if (cvFile) {
                const formData = new FormData();
                formData.append('file', cvFile);
                const uploadRes = await fetch('/api/uploadFirebase', {
                    method: 'POST',
                    body: formData,
                });
                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    cvPath = uploadData.path;
                }
            }

            const response = await fetch('/api/auth/send-signup-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: profileData.name,
                    email,
                    password,
                    role: 'mentee',
                    mentee_age: profileData.mentee_age,
                    mentee_occupation: profileData.mentee_occupation,
                    mentee_institution: profileData.mentee_institution,
                    linkedin: profileData.linkedin,
                    github: profileData.github,
                    allowCVShare: allowCVShare,
                    cv_link: cvPath,
                    linkedin_url: linkedinUrl,
                    personal_statement: personalStatement
                }),
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to resend code');
            }
            
            setSignupId(result.signupId);
            setCountdown(120);
            setCanResend(false);
            
            toast({
                title: "Code Resent!",
                description: "A new verification code has been sent to your email.",
            });
        } catch (error) {
            console.error('Failed to resend code:', error);
            toast({
                variant: "destructive",
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to resend code.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 md:px-6 py-12 bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40">
            <div className="w-full max-w-2xl">
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl text-center">
                            {showVerification ? 'Verify Your Email' : 'Verify Your Account'}
                        </CardTitle>
                        {!showVerification && (
                            <CardDescription className="text-center">
                                To ensure the quality of our community, please complete one of the following verification steps.
                            </CardDescription>
                        )}
                    </CardHeader>
                    <CardContent>
                        {!showVerification ? (
                        <>
                        <Tabs defaultValue="essay" onValueChange={setActiveTab}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="cv">CV/LinkedIn</TabsTrigger>
                                <TabsTrigger value="essay">Personal Statement</TabsTrigger>
                            </TabsList>
                            <TabsContent value="cv" className="mt-6">
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">Upload your CV/Resume (PDF) and provide a link to your LinkedIn profile.</p>
                                    <div className="grid w-full items-center gap-1.5">
                                        <Label htmlFor="cv-file">CV/Resume (PDF)</Label>
                                        <Input id="cv-file" type="file" accept=".pdf" onChange={(e) => setCvFile(e.target.files?.[0] || null)} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox 
                                            id="allow-cv-share"
                                            checked={allowCVShare}
                                            onCheckedChange={(checked) => setAllowCVShare(checked as boolean)}
                                        />
                                        <label 
                                            htmlFor="allow-cv-share"
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                        >
                                            Allow mentors to view my CV for meeting requests
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        Sharing your CV with mentors increases the likelihood of receiving and accepting meeting requests.
                                    </p>
                                    <div className="grid w-full items-center gap-1.5">
                                        <Label htmlFor="linkedin">LinkedIn Profile Link</Label>
                                        <Input 
                                            id="linkedin" 
                                            type="url" 
                                            placeholder="https://linkedin.com/in/yourprofile" 
                                            value={linkedinUrl}
                                            onChange={(e) => setLinkedinUrl(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </TabsContent>
                            <TabsContent value="essay" className="mt-6">
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">Write a personal statement about your interest in mentorship and what you hope to gain from the experience. (Minimum 50 words)</p>
                                    <Textarea 
                                        placeholder="Type your personal statement here..." 
                                        rows={8} 
                                        value={essay} 
                                        onChange={(e) => setEssay(e.target.value)} 
                                    />
                                    <p className="text-xs text-gray-500">
                                        Word count: {essay.trim().split(/\s+/).filter(word => word.length > 0).length} / 50 minimum
                                    </p>
                                </div>
                            </TabsContent>
                        </Tabs>
                        <Button 
                            onClick={handleSubmit} 
                            size="lg" 
                            className="w-full mt-8 bg-accent hover:bg-accent/90" 
                            disabled={(!cvFile && !essay) || isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending Code...
                                </>
                            ) : (
                                'Submit for Verification'
                            )}
                        </Button>
                        </>
                        ) : (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="verification">Verification Code</Label>
                                    <Input
                                        id="verification"
                                        type="text"
                                        maxLength={4}
                                        placeholder="Enter 4-digit code"
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        className="tracking-widest text-center text-lg"
                                        disabled={isVerifying}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        A 4-digit code was sent to {email}. Expires in {countdown > 0 && `${formatCountdownTime(countdown)}`}
                                    </p>
                                    {canResend && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="mt-1 text-amber-600 hover:text-amber-700"
                                            onClick={handleResendCode}
                                            disabled={isSubmitting}
                                        >
                                            Resend Code
                                        </Button>
                                    )}
                                </div>
                                
                                <Button 
                                    onClick={handleVerifyCode} 
                                    className="w-full" 
                                    disabled={isVerifying}
                                >
                                    {isVerifying ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Verifying...
                                        </>
                                    ) : (
                                        'Verify Code'
                                    )}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}