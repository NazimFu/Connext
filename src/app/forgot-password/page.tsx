'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Mail, KeyRound, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { auth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Step tracking: 'email' -> 'verify' -> 'reset'
  const [step, setStep] = useState<'email' | 'verify' | 'reset'>('email');
  
  // Form state
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/send-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Verification Code Sent",
          description: "Please check your email for the verification code.",
        });
        setStep('verify');
      } else {
        setError(data.message || 'Failed to send verification code.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Code Verified",
          description: "You can now reset your password.",
        });
        setStep('reset');
      } else {
        setError(data.message || 'Invalid verification code.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Verify code with backend
      const res = await fetch('/api/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode }),
      });

      const data = await res.json();

      if (res.ok) {
        // Code verified successfully, send Firebase password reset email
        await sendPasswordResetEmail(auth, email);
        
        // Delete the verification code since it's been used
        await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: verificationCode, newPassword: 'temporary' }),
        });
        
        toast({
          title: "Verification Successful!",
          description: "A password reset link has been sent to your email. Please check your inbox.",
          duration: 5000,
        });
        
        router.push('/login');
      } else {
        setError(data.message || 'Invalid verification code.');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40 py-12 px-4">
      <Card className="w-full max-w-md border-yellow-100/50 shadow-xl">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto">
            <Link href="/">
              <h1 className="text-3xl font-bold font-headline bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent cursor-pointer hover:from-yellow-500 hover:to-amber-600 transition-all">
                CONNEXT
              </h1>
            </Link>
          </div>
          <CardTitle className="text-2xl font-headline text-gray-900">
            {step === 'email' && 'Forgot Password'}
            {step === 'verify' && 'Verify Email'}
            {step === 'reset' && 'Confirm Reset'}
          </CardTitle>
          <CardDescription className="text-gray-600">
            {step === 'email' && 'Enter your email to receive a verification code'}
            {step === 'verify' && 'Enter the 6-digit code sent to your email'}
            {step === 'reset' && 'Click below to receive a secure password reset link'}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 1: Email Input */}
          {step === 'email' && (
            <form onSubmit={handleSendCode} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-gray-900">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-yellow-100/50 focus:border-amber-500 focus:ring-yellow-400/20 pl-10"
                    disabled={loading}
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-black font-semibold shadow-md hover:shadow-yellow-500/30 transition-all"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Verification Code'
                )}
              </Button>
            </form>
          )}

          {/* Step 2: Code Verification */}
          {step === 'verify' && (
            <form onSubmit={handleVerifyCode} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="code" className="text-gray-900">Verification Code</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="code"
                    type="text"
                    placeholder="Enter 6-digit code"
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    maxLength={6}
                    className="border-yellow-100/50 focus:border-amber-500 focus:ring-yellow-400/20 pl-10 text-center text-lg tracking-widest"
                    disabled={loading}
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Code sent to {email}
                </p>
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-black font-semibold shadow-md hover:shadow-yellow-500/30 transition-all"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Code'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setStep('email')}
                disabled={loading}
              >
                Use Different Email
              </Button>
            </form>
          )}

          {/* Step 3: Send Reset Link */}
          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="grid gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 text-center">
                  ✓ Email verified successfully!
                </p>
                <p className="text-xs text-green-600 text-center mt-2">
                  Click the button below to receive a secure password reset link via email.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-black font-semibold shadow-md hover:shadow-yellow-500/30 transition-all"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Reset Link...
                  </>
                ) : (
                  'Send Password Reset Link'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setStep('email')}
                disabled={loading}
              >
                Start Over
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex justify-center">
          <Link href="/login" className="text-sm text-gray-600 hover:text-amber-600 underline">
            Back to Login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
