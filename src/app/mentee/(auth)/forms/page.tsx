'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { auth } from "../../../../lib/firebase";
import { Textarea } from '@/components/ui/textarea';
import React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function ProfileFormPage() {
  const [name, setName] = useState('');
  const router = useRouter();
  const [age, setAge] = useState('');
  const [occupation, setOccupation] = useState('');
  const [institution, setInstitution] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  
  // Load credentials from sessionStorage
  useEffect(() => {
    const storedEmail = sessionStorage.getItem('signup_email');
    const storedPassword = sessionStorage.getItem('signup_password');
    
    if (!storedEmail || !storedPassword) {
      // Redirect to signup if credentials not found
      router.push('/signup');
      return;
    }
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Validate required fields
    if (!name.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter your name.",
      });
      return;
    }
    
    if (!age) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter your age.",
      });
      return;
    }
    
    if (!occupation.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter your occupation.",
      });
      return;
    }
    
    if (!institution.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter your institution.",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Store profile data in sessionStorage
      sessionStorage.setItem('profile_name', name.trim());
      sessionStorage.setItem('profile_age', age);
      sessionStorage.setItem('profile_occupation', occupation.trim());
      sessionStorage.setItem('profile_institution', institution.trim());
      sessionStorage.setItem('profile_linkedin', linkedin.trim());
      sessionStorage.setItem('profile_github', github.trim());
      
      toast({
        title: "Profile Saved!",
        description: "Please complete the verification step.",
      });
      
      // Route to verification page
      router.push('/mentee/verification');
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save profile data.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 md:px-6 py-12 bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl text-center">Create Your Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="Enter your age"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input
                  id="occupation"
                  type="text"
                  placeholder="Enter your occupation"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="institution">Institution</Label>
                <Input
                  id="institution"
                  type="text"
                  placeholder="Enter your institution"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedin">LinkedIn Profile</Label>
                <Input
                  id="linkedin"
                  type="url"
                  placeholder="https://linkedin.com/in/yourprofile"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="github">GitHub Profile</Label>
                <Input
                  id="github"
                  type="url"
                  placeholder="https://github.com/yourusername"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Continue to Verification'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}