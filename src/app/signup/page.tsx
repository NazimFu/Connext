"use client"

import Link from "next/link"
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { auth } from '../../lib/firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { Separator } from "@/components/ui/separator"
import { Eye, EyeOff } from "lucide-react"

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const signIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
    try {
      e.preventDefault();
      setError('');
      
      // Validate inputs
      if (!email || !password) {
        setError('Please enter email and password');
        return;
      }
      
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      
      // Store credentials in sessionStorage (will be used after form completion)
      sessionStorage.setItem('signup_email', email);
      sessionStorage.setItem('signup_password', password);
      
      // Route to forms without creating Firebase user yet
      router.push('/mentee/forms');
    } catch (err) {
      console.error(err);
      setError('An error occurred. Please try again.');
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40 py-12">
      <Card className="w-full max-w-md border-yellow-100/50 shadow-xl">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto">
            <h1 className="text-3xl font-bold font-headline bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent mb-2">
              CONNEXT
            </h1>
          </div>
          <CardTitle className="text-2xl font-headline text-gray-900">Become a Mentee</CardTitle>
          <CardDescription className="text-gray-600">
            Create your account to start your mentorship journey.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-gray-900">Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="your@email.com" 
              required 
              onChange={(e) => setEmail(e.target.value)}
              className="border-yellow-100/50 focus:border-amber-500 focus:ring-yellow-400/20"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password" className="text-gray-900">Password</Label>
            <div className="relative">
              <Input 
                id="password" 
                type={showPassword ? "text" : "password"} 
                required 
                onChange={(e) => setPassword(e.target.value)}
                className="border-yellow-100/50 focus:border-amber-500 focus:ring-yellow-400/20 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button 
            className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-black font-semibold shadow-md hover:shadow-yellow-500/30 transition-all" 
            onClick={signIn}
          >
            Create Mentee Account
          </Button>

          <div className="relative w-full">
            <Separator className="my-2" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-xs text-muted-foreground">
              OR
            </span>
          </div>

          <Button 
            variant="outline"
            className="w-full border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700 font-semibold transition-all" 
            onClick={() => router.push('/signup/mentor_secret')}
          >
            Sign Up as Mentor
          </Button>

          <div className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-amber-600 hover:text-amber-700 underline">
              Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
