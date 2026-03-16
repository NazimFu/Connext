'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRequireAuth } from "@/hooks/use-auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Camera, Github, Linkedin, Loader2, User, Briefcase, Award, Eye, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useEffect, useState } from 'react'
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

export default function EditProfilePage() {
    const { user, isLoading } = useRequireAuth('mentee');
    const { toast } = useToast();

    // State for form fields
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        linkedin: '',
        github: '',
        cv_link: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [cvFile, setCvFile] = useState<File | null>(null);
    const [isUploadingCV, setIsUploadingCV] = useState(false);
    const [allowCVShare, setAllowCVShare] = useState(false);

    // Initialize form data from user object (no extra API call needed)
    useEffect(() => {
        if (user) {
            console.log('Full user object:', user);
            console.log('LinkedIn value:', (user as any).linkedin);
            console.log('GitHub value:', (user as any).github);
            console.log('AttachmentPath value:', (user as any).attachmentPath);
            setFormData({
                name: user.name || '',
                email: user.email || '',
                linkedin: (user as any).linkedin || '',
                github: (user as any).github || '',
                cv_link: (user as any).attachmentPath || (user as any).cv_link || ''
            });
            setAllowCVShare((user as any).allowCVShare ?? false);
            console.log('FormData after setting:', {
                linkedin: (user as any).linkedin || '',
                github: (user as any).github || '',
                cv_link: (user as any).attachmentPath || (user as any).cv_link || ''
            });
        }
    }, [user]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSave = async () => {
        // Use menteeUID if available, otherwise fall back to id
        const userId = (user as any).menteeUID || user?.id;
        
        if (!userId) {
            toast({
                title: 'Error',
                description: 'User ID not found. Please log in again.',
                variant: 'destructive'
            });
            return;
        }

        setIsSaving(true);
        console.log('Saving profile with user ID:', userId);
        console.log('User object:', user);
        console.log('Form data:', formData);
        
        try {
            const response = await fetch('/api/mentee/profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: userId,
                    ...formData,
                    allowCVShare: allowCVShare
                }),
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error response:', errorData);
                throw new Error(errorData.message || 'Failed to update profile');
            }

            const result = await response.json();
            console.log('Update successful:', result);
            
            toast({
                title: 'Profile Updated',
                description: 'Your profile has been successfully updated.',
            });
        } catch (error) {
            console.error('Error updating profile:', error);
            toast({
                title: 'Error',
                description: 'Failed to update profile. Please try again.',
                variant: 'destructive'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCVUpload = async () => {
        if (!cvFile) {
            toast({
                title: 'Error',
                description: 'Please select a PDF file to upload.',
                variant: 'destructive'
            });
            return;
        }

        setIsUploadingCV(true);
        try {
            const formDataObj = new FormData();
            formDataObj.append('file', cvFile);

            const uploadRes = await fetch('/api/uploadFirebase', {
                method: 'POST',
                body: formDataObj,
            });

            if (!uploadRes.ok) {
                throw new Error('Failed to upload CV file');
            }

            const uploadData = await uploadRes.json();
            const cvPath = uploadData.path;

            // Update formData with new CV path
            setFormData(prev => ({
                ...prev,
                cv_link: cvPath
            }));

            // Update profile with new CV path
            const userId = (user as any).menteeUID || user?.id;
            const response = await fetch('/api/mentee/profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: userId,
                    cv_link: cvPath,
                    allowCVShare: allowCVShare
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to save CV');
            }

            setCvFile(null);
            toast({
                title: 'CV Updated',
                description: 'Your CV has been successfully uploaded.',
            });
        } catch (error) {
            console.error('Error uploading CV:', error);
            toast({
                title: 'Error',
                description: 'Failed to upload CV. Please try again.',
                variant: 'destructive'
            });
        } finally {
            setIsUploadingCV(false);
        }
    };

    if (isLoading || !user) {
        return (
            <div className="flex justify-center items-center h-screen bg-gray-100">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Loading your profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white border border-gray-400 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-400 font-semibold text-lg">
                        Edit Your Profile
                    </div>
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="p-6"
                    >
                        {/* Avatar Section */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                        >
                            <Card className="mb-6 border-blue-200 shadow-lg hover:shadow-xl transition-shadow">
                                <CardContent className="p-6">
                                    <div className="flex flex-col md:flex-row items-center gap-6">
                                        <div className="relative group">
                                            <Avatar className="h-32 w-32 ring-4 ring-blue-200 ring-offset-4 transition-all group-hover:ring-blue-400 group-hover:scale-105">
                                                <AvatarImage src={user.image} alt={user.name || 'Mentee'} />
                                                <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white text-3xl font-bold">
                                                    {user.name?.slice(0, 2).toUpperCase() || 'ME'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <Button 
                                                size="icon" 
                                                className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg"
                                            >
                                                <Camera className="h-5 w-5" />
                                            </Button>
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
                                        </div>
                                        <div className="flex-1 text-center md:text-left">
                                            <h2 className="text-2xl font-bold text-gray-900 mb-1">
                                                {formData.name || 'Mentee Name'}
                                            </h2>
                                            <p className="text-gray-600 mb-3">{formData.email}</p>
                                            <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                                                <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                                                    <Award className="w-3 h-3 mr-1" />
                                                    Mentee
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Main Form */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                        >
                            <Card className="border-blue-200 shadow-lg">
                                <CardContent className="p-6 md:p-8 space-y-8">
                                    {/* Personal Information */}
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 pb-3 border-b border-blue-100">
                                            <div className="p-2 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg">
                                                <User className="h-5 w-5 text-white" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-xl text-gray-900">Personal Information</h3>
                                                <p className="text-sm text-gray-600">Your basic details</p>
                                            </div>
                                        </div>
                                        <div className="grid md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label htmlFor="name" className="text-sm font-semibold text-gray-700">
                                                    Full Name <span className="text-red-500">*</span>
                                                </Label>
                                                <Input
                                                    id="name"
                                                    name="name"
                                                    value={formData.name}
                                                    onChange={handleInputChange}
                                                    placeholder="Enter your full name"
                                                    className="border-gray-400 focus:border-blue-400 focus:ring-blue-400/20"
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                                                    Email Address
                                                </Label>
                                                <Input
                                                    id="email"
                                                    name="email"
                                                    type="email"
                                                    value={formData.email}
                                                    onChange={handleInputChange}
                                                    placeholder="your.email@example.com"
                                                    className="border-gray-400 focus:border-blue-400 focus:ring-blue-400/20"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Social & Professional */}
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 pb-3 border-b border-blue-100">
                                            <div className="p-2 bg-gradient-to-br from-purple-400 to-purple-600 rounded-lg">
                                                <Briefcase className="h-5 w-5 text-white" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-xl text-gray-900">Professional Links</h3>
                                                <p className="text-sm text-gray-600">Connect your social and professional profiles</p>
                                            </div>
                                        </div>
                                        <div className="grid md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label htmlFor="linkedin" className="text-sm font-semibold text-gray-700">
                                                    LinkedIn Profile
                                                </Label>
                                                <div className="relative">
                                                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-600" />
                                                    <Input
                                                        id="linkedin"
                                                        name="linkedin"
                                                        value={formData.linkedin}
                                                        onChange={handleInputChange}
                                                        placeholder="https://linkedin.com/in/yourprofile"
                                                        className="pl-10 border-gray-400 focus:border-blue-400 focus:ring-blue-400/20"
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-500">Your LinkedIn profile URL</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="github" className="text-sm font-semibold text-gray-700">
                                                    GitHub Profile
                                                </Label>
                                                <div className="relative">
                                                    <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-700" />
                                                    <Input
                                                        id="github"
                                                        name="github"
                                                        value={formData.github}
                                                        onChange={handleInputChange}
                                                        placeholder="https://github.com/yourusername"
                                                        className="pl-10 border-gray-400 focus:border-blue-400 focus:ring-blue-400/20"
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-500">Your GitHub profile URL</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* CV */}
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 pb-3 border-b border-blue-100">
                                            <div className="p-2 bg-gradient-to-br from-green-400 to-green-600 rounded-lg">
                                                <Award className="h-5 w-5 text-white" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-xl text-gray-900">Education & Resume</h3>
                                                <p className="text-sm text-gray-600">Share your CV and qualifications</p>
                                            </div>
                                        </div>
                                        
                                        {/* View/Update CV Section */}
                                        {formData.cv_link && (
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div>
                                                        <p className="text-sm font-medium text-green-900">CV/Resume Uploaded</p>
                                                        <p className="text-xs text-green-700">Click to view your current CV</p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-green-300 hover:bg-green-100"
                                                        onClick={() => {
                                                            const cvUrl = formData.cv_link!.startsWith('http') 
                                                                ? formData.cv_link 
                                                                : `/api/attachment-proxy?url=${encodeURIComponent(formData.cv_link!)}`;
                                                            window.open(cvUrl, '_blank');
                                                        }}
                                                    >
                                                        <Eye className="h-4 w-4 mr-1" />
                                                        View CV
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Upload New CV Section */}
                                        <div className="space-y-3">
                                            <Label className="text-sm font-semibold text-gray-700">Update CV/Resume</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="file"
                                                    accept=".pdf"
                                                    onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                                                    className="border-gray-400 focus:border-blue-400 focus:ring-blue-400/20"
                                                    disabled={isUploadingCV}
                                                />
                                                <Button
                                                    onClick={handleCVUpload}
                                                    disabled={!cvFile || isUploadingCV}
                                                    className="bg-blue-600 hover:bg-blue-700"
                                                >
                                                    {isUploadingCV ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                            Uploading...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload className="h-4 w-4 mr-1" />
                                                            Upload
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                            <p className="text-xs text-gray-500">Upload a PDF file (recommended: max 5MB)</p>
                                        </div>

                                        {/* CV Sharing Consent Checkbox */}
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                            <div className="flex items-start gap-3">
                                                <Checkbox 
                                                    id="allow-cv-share-profile"
                                                    checked={allowCVShare}
                                                    onCheckedChange={(checked) => setAllowCVShare(checked as boolean)}
                                                    className="mt-1"
                                                />
                                                <div className="flex-1">
                                                    <label 
                                                        htmlFor="allow-cv-share-profile"
                                                        className="text-sm font-medium text-blue-900 cursor-pointer"
                                                    >
                                                        Allow mentors to view my CV for meeting requests
                                                    </label>
                                                    <p className="text-xs text-blue-700 mt-1">
                                                        Sharing your CV with mentors increases the likelihood of receiving and accepting meeting requests.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Save Button */}
                                    <div className="pt-6 border-t border-blue-100">
                                        <Button
                                            onClick={handleSave}
                                            size="lg"
                                            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all text-lg py-6"
                                            disabled={isSaving}
                                        >
                                            {isSaving ? (
                                                <>
                                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                    Saving Your Profile...
                                                </>
                                            ) : (
                                                <>
                                                    <Award className="mr-2 h-5 w-5" />
                                                    Save Changes
                                                </>
                                            )}
                                        </Button>
                                        <p className="text-center text-sm text-gray-500 mt-3">
                                            Your changes will be saved immediately
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </div>
    )
}
