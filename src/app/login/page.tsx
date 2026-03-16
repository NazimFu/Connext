'use client';

import Link from "next/link"
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import type { UserRoleResponse } from "@/lib/types";

import { auth } from '../../lib/firebase'
import { signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter();
  const { user, isAuthLoading, logout } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function getUserRole(email: string): Promise<string | null> {
    try {
      console.log("Getting user role for email:", email);
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data: any = await res.json();
      console.log("getUserRole response:", { status: res.status, data });
      
      if (res.ok) {
        console.log("User Role:", data.role);
        return data.role;
      } else {
        console.error("Error getting user role:", data.error || data.message);
        return null;
      }
    } catch (error) {
      console.error("Network error getting user role:", error);
      return null;
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginSuccess(false);
    setLoading(true);
    
    if (!auth) {
      setError("Firebase Auth not initialized.");
      setLoading(false);
      return;
    }

    try {
      // Attempt Firebase login first
      await signInWithEmailAndPassword(auth, email, password);
      
      // Then check user role
      const role = await getUserRole(email);
      if (!role) {
        await signOut(auth);
        setError("User account not found in our system. Please contact support or sign up.");
        setLoading(false);
        return;
      }

      // Get the user data based on role
      const endpoint = role === 'mentee' ? '/api/auth/mentee' : '/api/auth/mentor';
      const userRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!userRes.ok) {
        const errorData = await userRes.json();
        await signOut(auth);
        setError(`Failed to load user data: ${errorData.message || 'Unknown error'}`);
        setLoading(false);
        return;
      }

      const userData = await userRes.json();
      console.log("User data retrieved:", userData);

      // Check verification status for mentees
      if (role === 'mentee') {
        const verificationStatus = userData.verificationStatus;
        
        console.log("Mentee verification status:", verificationStatus);

        if (!verificationStatus) {
          // No verification status means they haven't submitted verification yet
          await signOut(auth);
          setError("Please complete your profile and submit for verification.");
          setLoading(false);
          return;
        }

        if (verificationStatus === 'pending' || verificationStatus === 'not-submitted') {
          // Don't sign out - allow them to see the pending page
          setLoginSuccess(true);
          toast({
            title: "Verification Pending",
            description: "Your account is under review. You will be notified once approved.",
            variant: "default",
          });
          router.push('/mentee/verification-pending');
          setLoading(false);
          return;
        }

        if (verificationStatus === 'rejected') {
          await signOut(auth);
          setError("Your verification request was rejected. Please contact support for assistance.");
          setLoading(false);
          return;
        }

        if (verificationStatus !== "approved" && verificationStatus !== "just-approved") {
          await signOut(auth);
          setError("Your account verification status is invalid. Please contact support.");
          setLoading(false);
          return;
        }

        // If we reach here, verification is approved
        console.log("Mentee verification approved - allowing login");
      }

      // Check verification status for mentors
      if (role === 'mentor') {
        const verificationStatus = userData.verificationStatus;
        
        console.log("Mentor verification status:", verificationStatus);

        // Mentors cannot login until they are approved
        // They can only access verification-pending page immediately after form submission
        if (verificationStatus === 'pending' || verificationStatus === 'not-submitted') {
          await signOut(auth);
          setError("Your mentor application is under review. You will be able to login once approved.");
          setLoading(false);
          return;
        }

        if (verificationStatus === 'rejected') {
          await signOut(auth);
          setError("Your mentor application was rejected. Please contact support for assistance.");
          setLoading(false);
          return;
        }

        if (verificationStatus !== "approved" && verificationStatus !== "just-approved") {
          await signOut(auth);
          setError("Your mentor verification status is invalid. Please contact support.");
          setLoading(false);
          return;
        }

        // If we reach here, verification is approved
        console.log("Mentor verification approved - allowing login");
      }

      // Only set login success after all checks pass
      setLoginSuccess(true);
      console.log("Login successful with role:", role);
      
      toast({
        title: "Login Successful",
        description: `Welcome back!`,
      });

      // Redirect based on role
      const dashboardPath = role === 'mentee' ? '/mentee/mentor-listing' :
                          role === 'mentor' ? '/mentor/mentor-listing' :
                          role === 'staff' ? '/staff/dashboard' : '/';
      router.push(dashboardPath);
    } catch (error: any) {
      console.error("Login error:", error);
      
      if (!error) {
        setError('An unknown error occurred during login.');
        setLoading(false);
        return;
      }
      
      switch (error.code) {
        case 'auth/invalid-email':
          setError('Invalid email address format.');
          break;
        case 'auth/user-disabled':
          setError('This account has been disabled.');
          break;
        case 'auth/user-not-found':
          setError('No user found with this email.');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password.');
          break;
        case 'auth/invalid-credential':
          setError('Invalid credentials. Please check your email and password.');
          break;
        default:
          setError(`Login failed: ${error.message || error.toString() || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    } 
  };

  // Wait for user context to be set, then redirect
  useEffect(() => {
    console.log('Login Page - Redirect Effect:', {
      isAuthLoading,
      userExists: !!user,
      userRole: user?.role,
      loginSuccess,
      currentPath: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
    });
    
    if (!isAuthLoading && user && loginSuccess) {
      if (user.role === 'mentee') {
        // Double check verification status from context
        if (user.verificationStatus === 'approved' || user.verificationStatus === 'just-approved') {
          router.push('/mentee/mentor-listing');
        } else if (user.verificationStatus === 'pending' || user.verificationStatus === 'not-submitted') {
          router.push('/mentee/verification-pending');
        } else {
          logout();
          setError("Your account is not verified. Please wait for approval.");
        }
      } else if (user.role === 'mentor') {
        // Mentors can only login if approved
        if (user.verificationStatus === 'approved' || user.verificationStatus === 'just-approved') {
          router.push('/mentor/mentor-listing');
        } else {
          // Mentors with pending/rejected status cannot login
          logout();
          setError("Your mentor account is not approved yet. Please wait for admin approval.");
        }
      } else if (user.role === 'staff') {
        router.push('/staff/dashboard');
      } else {
        router.push('/');
      }
    }
  }, [isAuthLoading, user, router, loginSuccess, logout]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40 py-12">
      <Card className="w-full max-w-sm border-yellow-100/50 shadow-xl">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto">
            <Link href="/">
              <h1 className="text-3xl font-bold font-headline bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent cursor-pointer hover:from-yellow-500 hover:to-amber-600 transition-all">
                CONNEXT
              </h1>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="username" className="text-gray-900">Email</Label>
            <Input 
              id="username" 
              placeholder="your@email.com" 
              required 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              className="border-yellow-100/50 focus:border-amber-500 focus:ring-yellow-400/20"
              disabled={loading}
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-gray-900">Password</Label>
              <Link href="/forgot-password" className="text-xs text-amber-600 hover:text-amber-700 underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input 
                id="password" 
                type={showPassword ? "text" : "password"} 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-yellow-100/50 focus:border-amber-500 focus:ring-yellow-400/20 pr-10"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          {error && (
            <div className="text-red-600 text-sm mt-2 p-3 bg-red-50 rounded-md border border-red-200">
              {error}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col">
          <Button 
            className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-black font-semibold shadow-md hover:shadow-yellow-500/30 transition-all" 
            onClick={handleLogin} 
            disabled={!email || !password || loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
          <div className="mt-4 text-center text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold text-amber-600 hover:text-amber-700 underline">
              Sign up
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
