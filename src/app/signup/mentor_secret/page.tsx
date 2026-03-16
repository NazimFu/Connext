"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { auth } from '../../../lib/firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function MentorSignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secretPassword, setSecretPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecretPassword, setShowSecretPassword] = useState(false);

  const getFirebaseErrorMessage = (errorCode: string): string => {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please use a different email or sign in to your existing account.';
      case 'auth/invalid-email':
        return 'Invalid email address. Please check and try again.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/operation-not-allowed':
        return 'Email/password accounts are not enabled. Please contact support.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection and try again.';
      default:
        return 'Failed to create account. Please try again.';
    }
  };

  const signIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    
    // Clear previous errors
    setError('');
    
    // First verify the secret password
    if (secretPassword !== 'luminiktyo') {
      setError('Invalid secret password. Please contact the administrator for the correct password.');
      return;
    }

    // Validate email and password
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Store credentials in sessionStorage for later use in mentor/forms
      sessionStorage.setItem('mentor_signup_email', email);
      sessionStorage.setItem('mentor_signup_password', password);

      toast({
        title: "Ready to Build Your Profile!",
        description: "Your credentials are saved. Now let's complete your mentor profile.",
      });

      // Redirect to mentor forms
      router.push('/mentor/forms');

    } catch (err: any) {
      console.error('Mentor signup error:', err);
      
      const errorMessage = err.code 
        ? getFirebaseErrorMessage(err.code)
        : err.message || 'Failed to proceed. Please try again.';
      
      setError(errorMessage);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white via-amber-50/30 to-yellow-50/40 py-12 px-4">
      <Card className="w-full max-w-md border-amber-100/50 shadow-xl">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto">
            <h1 className="text-3xl font-bold font-headline bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent mb-2">
              CONNEXT
            </h1>
          </div>
          <CardTitle className="text-2xl font-headline text-gray-900">Become a Mentor</CardTitle>
          <CardDescription className="text-gray-600">
            Create your mentor account to start helping others grow.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="secretPassword" className="text-gray-900">Secret Password</Label>
            <div className="relative">
              <Input 
                id="secretPassword" 
                type={showSecretPassword ? "text" : "password"} 
                placeholder="Enter the secret password"
                required 
                value={secretPassword}
                onChange={(e) => setSecretPassword(e.target.value)}
                disabled={isSubmitting}
                className="border-amber-100/50 focus:border-amber-500 focus:ring-yellow-400/20 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecretPassword(!showSecretPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                disabled={isSubmitting}
              >
                {showSecretPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Contact administrator if you don't have the secret password
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-gray-900">Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="mentor@example.com" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="border-amber-100/50 focus:border-amber-500 focus:ring-yellow-400/20"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password" className="text-gray-900">Password</Label>
            <div className="relative">
              <Input 
                id="password" 
                type={showPassword ? "text" : "password"} 
                placeholder="Minimum 6 characters"
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="border-amber-100/50 focus:border-amber-500 focus:ring-yellow-400/20 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                disabled={isSubmitting}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button 
            className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-black font-semibold shadow-md hover:shadow-yellow-500/30 transition-all disabled:opacity-50" 
            onClick={signIn}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Account...
              </>
            ) : (
              'Create Mentor Account'
            )}
          </Button>

          <div className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-amber-600 hover:text-amber-700 underline">
              Sign in
            </Link>
          </div>

          <div className="text-center text-sm text-gray-600">
            Want to be a mentee instead?{" "}
            <Link href="/signup" className="font-semibold text-amber-600 hover:text-amber-700 underline">
              Sign up as mentee
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
