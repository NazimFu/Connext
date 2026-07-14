'use client'

// src/app/mentee/profile/edit/page.tsx
//
// Redesigned to match the mentor edit page: Fresha-style cards, amber brand,
// neutral grayscale, minimal semantic colors. Left = identity summary,
// right = editable section cards. All logic/data flow unchanged.

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth, useRequireAuth } from "@/hooks/use-auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, Eye, Upload, CheckCircle2, AlertCircle, Clock, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useEffect, useState } from 'react'
import { motion } from "framer-motion"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TimezoneSelector } from "@/components/ui/timezone-selector"
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from "@/lib/timezone"

const MAX_CV_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_CV_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_CV_EXTENSIONS = ['.pdf', '.docx'];

const CARD = 'bg-white rounded-2xl border border-neutral-200/70 shadow-sm';
const LABEL = 'text-sm font-medium text-neutral-700';
const INPUT = 'border-neutral-200 focus-visible:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-600/20';

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className={`${CARD} p-6 sm:p-8`}>
            <div className="border-b border-neutral-100 pb-4 mb-6">
                <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
                {description && <p className="text-sm text-neutral-500 mt-1">{description}</p>}
            </div>
            <div className="space-y-6">{children}</div>
        </section>
    );
}

// Display-only field row: label on top, value below. Empty value shows "+ Add".
function FieldRow({ label, value, onAdd }: { label: string; value?: string; onAdd?: () => void }) {
    return (
        <div className="py-3 w-full">
            <p className="text-sm font-semibold text-neutral-900">{label}</p>
            {value
                ? <p className="text-sm text-neutral-500 break-words">{value}</p>
                : <button type="button" onClick={onAdd} className="text-sm text-amber-600 hover:text-amber-700">+ Add</button>}
        </div>
    );
}

export default function EditProfilePage() {
    const { user, isLoading } = useRequireAuth('mentee');
    const { refreshUser, logout } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [formData, setFormData] = useState({ name: '', email: '', linkedin: '', github: '', cv_link: '' });
    const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
    const [isSaving, setIsSaving] = useState(false);
    const [cvFile, setCvFile] = useState<File | null>(null);
    const [isUploadingCV, setIsUploadingCV] = useState(false);
    const [allowCVShare, setAllowCVShare] = useState(false);
    const [basicInfoOpen, setBasicInfoOpen] = useState(false);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);

    const [emailDialogOpen, setEmailDialogOpen] = useState(false);
    const [newEmailInput, setNewEmailInput] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [emailChangeStep, setEmailChangeStep] = useState<'input' | 'verify' | 'success'>('input');
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [isVerifyingCode, setIsVerifyingCode] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [canResend, setCanResend] = useState(true);

    useEffect(() => {
        if (countdown > 0) { const t = setTimeout(() => setCountdown(c => c - 1), 1000); return () => clearTimeout(t); }
        else if (countdown === 0 && !canResend) setCanResend(true);
    }, [countdown, canResend]);

    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || '',
                email: user.email || '',
                linkedin: (user as any).linkedin || '',
                github: (user as any).github || '',
                cv_link: (user as any).cv_link || ''
            });
            setAllowCVShare((user as any).allowCVShare ?? false);
            setTimezone((user as any).timezone || DEFAULT_TIMEZONE);
        }
    }, [user]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const validateCvFile = (file: File) => {
        const lowerName = file.name.toLowerCase();
        const hasAllowedExtension = ALLOWED_CV_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
        const hasAllowedMimeType = ALLOWED_CV_MIME_TYPES.includes(file.type);
        if (!hasAllowedExtension && !hasAllowedMimeType) return 'Only PDF or DOCX files are allowed.';
        if (file.size > MAX_CV_SIZE_BYTES) return 'CV file must be 2MB or smaller.';
        return null;
    };

    const handleSave = async () => {
        const userId = (user as any).menteeUID || user?.id;
        if (!userId) { toast({ title: 'Error', description: 'User ID not found.', variant: 'destructive' }); return; }
        setIsSaving(true);
        try {
            const response = await fetch('/api/mentee/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userId, ...formData, allowCVShare, timezone }),
            });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || 'Failed to update profile'); }
            const { auth } = await import('@/lib/firebase');
            await auth.currentUser?.reload();
            await refreshUser();
            toast({ title: 'Profile updated', description: 'Your profile has been saved.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update profile. Please try again.', variant: 'destructive' });
        } finally { setIsSaving(false); }
    };

    const handleSendVerificationCode = async () => {
        if (!newEmailInput.trim()) { toast({ variant: 'destructive', title: 'Error', description: 'Please enter a new email address.' }); return; }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmailInput)) { toast({ variant: 'destructive', title: 'Invalid email', description: 'Please enter a valid email address.' }); return; }
        if (newEmailInput.toLowerCase() === formData.email.toLowerCase()) { toast({ variant: 'destructive', title: 'Same email', description: 'New email must be different from your current email.' }); return; }
        const userId = (user as any).menteeUID || user?.id;
        setIsSendingCode(true);
        try {
            const res = await fetch('/api/mentee/send-verification-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menteeId: userId, currentEmail: formData.email, newEmail: newEmailInput }) });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to send verification code');
            toast({ title: 'Code sent', description: `A 6-digit code was sent to ${newEmailInput}.` });
            setEmailChangeStep('verify'); setCountdown(300); setCanResend(false);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Failed to send code.' });
        } finally { setIsSendingCode(false); }
    };

    const handleVerifyEmailCode = async () => {
        if (!verificationCode.trim() || verificationCode.length !== 6) { toast({ variant: 'destructive', title: 'Invalid code', description: 'Please enter the 6-digit code.' }); return; }
        const userId = (user as any).menteeUID || user?.id;
        setIsVerifyingCode(true);
        try {
            const res = await fetch('/api/mentee/verify-email-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menteeId: userId, newEmail: newEmailInput, code: verificationCode.trim() }) });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to verify code');
            setFormData(prev => ({ ...prev, email: newEmailInput }));

            // Changing the Firebase Auth email invalidates the current session token,
            // so refreshing the local user here can throw (e.g. auth/user-token-expired).
            // That's expected — prompt for a fresh login instead of surfacing the raw error.
            try {
                const { auth } = await import('@/lib/firebase');
                await auth.currentUser?.reload();
                await refreshUser();
                toast({ title: 'Email updated', description: `Your email has been changed to ${newEmailInput}.` });
                setEmailChangeStep('success');
                setTimeout(() => handleCancelEmailChange(), 2000);
            } catch {
                toast({ title: 'Email updated — please log in again', description: `Your email has been changed to ${newEmailInput}. For security, please log in again.` });
                setEmailChangeStep('success');
                setTimeout(async () => {
                    const { auth } = await import('@/lib/firebase');
                    await auth.signOut();
                    router.push('/login');
                }, 2000);
            }
        } catch (err) {
            toast({ variant: 'destructive', title: 'Verification failed', description: err instanceof Error ? err.message : 'Failed to verify code.' });
        } finally { setIsVerifyingCode(false); }
    };

    const handleCancelEmailChange = () => {
        setEmailDialogOpen(false); setNewEmailInput(''); setVerificationCode('');
        setEmailChangeStep('input'); setCountdown(0); setCanResend(true);
    };

    const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    const handleDeleteAccount = async () => {
        const userId = (user as any).menteeUID || user?.id;
        if (!userId) { toast({ title: 'Error', description: 'User ID not found.', variant: 'destructive' }); return; }
        if (deleteConfirmText.trim() !== 'DELETE') return;
        setIsDeletingAccount(true);
        try {
            const res = await fetch('/api/mentee/delete-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userId }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to delete account');
            toast({ title: 'Account deleted', description: 'Your account and data have been removed.' });
            setDeleteDialogOpen(false);
            setTimeout(async () => {
                await logout();
                router.push('/login');
            }, 1500);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Could not delete account', description: err instanceof Error ? err.message : 'Please try again.' });
        } finally { setIsDeletingAccount(false); }
    };

    const handleCVUpload = async () => {
        if (!cvFile) { toast({ title: 'Error', description: 'Please select a PDF or DOCX file to upload.', variant: 'destructive' }); return; }
        const cvValidationError = validateCvFile(cvFile);
        if (cvValidationError) { toast({ title: 'Error', description: cvValidationError, variant: 'destructive' }); return; }
        setIsUploadingCV(true);
        try {
            const formDataObj = new FormData();
            formDataObj.append('file', cvFile);
            const uploadRes = await fetch('/api/uploadFirebase', { method: 'POST', body: formDataObj });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) throw new Error(uploadData.error || 'Failed to upload CV file');
            const cvPath = uploadData.path;
            setFormData(prev => ({ ...prev, cv_link: cvPath }));
            const userId = (user as any).menteeUID || user?.id;
            const response = await fetch('/api/mentee/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userId, cv_link: cvPath, allowCVShare }),
            });
            if (!response.ok) throw new Error('Failed to save CV');
            setCvFile(null);
            toast({ title: 'CV updated', description: 'Your CV has been uploaded.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to upload CV. Please try again.', variant: 'destructive' });
        } finally { setIsUploadingCV(false); }
    };

    if (isLoading || !user) {
        return (
            <div className="flex justify-center items-center h-screen bg-neutral-100">
                <div className="text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-amber-700 mx-auto mb-3" />
                    <p className="text-neutral-500 text-sm font-medium">Loading your profile…</p>
                </div>
            </div>
        );
    }

    const currentTzOption = TIMEZONE_OPTIONS.find(o => o.value === timezone);
    const timezoneLabel = currentTzOption ? `${currentTzOption.label} (${currentTzOption.offset})` : timezone;

    const SaveButton = (
        <Button onClick={handleSave} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 shadow-sm">
            {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save changes'}
        </Button>
    );

    // Email change dialog (used from the "Edit basic info" card)
    const EmailDialog = (
        <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
            <DialogTrigger asChild>
                <button type="button" className="text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline">Change</button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Change email address</DialogTitle>
                    <DialogDescription>
                        {emailChangeStep === 'input' && 'Enter your new email address to receive a verification code.'}
                        {emailChangeStep === 'verify' && 'Enter the 6-digit code sent to your new email.'}
                        {emailChangeStep === 'success' && 'Email successfully updated.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-3">
                    <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3">
                        <p className="text-xs text-neutral-500 mb-0.5">Current email</p>
                        <p className="text-sm font-medium text-neutral-900 break-all">{formData.email}</p>
                    </div>
                    {emailChangeStep === 'input' && (
                        <>
                            <div className="space-y-1.5"><Label className={LABEL}>New email address</Label><Input type="email" placeholder="your.new.email@example.com" value={newEmailInput} onChange={(e) => setNewEmailInput(e.target.value)} className={INPUT} /></div>
                            <Alert><AlertCircle className="h-4 w-4" /><AlertDescription className="text-sm">A 6-digit verification code will be sent to this email address.</AlertDescription></Alert>
                        </>
                    )}
                    {emailChangeStep === 'verify' && (
                        <>
                            <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><p className="text-sm font-medium text-neutral-900 break-all">{newEmailInput}</p></div>
                            <div className="space-y-1.5"><Label className={LABEL}>Verification code</Label><Input type="text" placeholder="000000" maxLength={6} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl font-mono tracking-widest" /></div>
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-neutral-400" /><span className={countdown < 60 ? 'text-red-600 font-medium' : 'text-neutral-500 font-medium'}>{formatCountdown(countdown)}</span></div>
                                <Button variant="link" size="sm" onClick={() => { setVerificationCode(''); handleSendVerificationCode(); }} disabled={!canResend || isSendingCode} className="text-neutral-700 h-auto p-0">{isSendingCode ? 'Sending…' : 'Resend code'}</Button>
                            </div>
                        </>
                    )}
                    {emailChangeStep === 'success' && (
                        <div className="text-center py-6">
                            <div className="mx-auto w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-3"><CheckCircle2 className="h-8 w-8 text-emerald-600" /></div>
                            <h3 className="text-base font-semibold text-neutral-900 mb-1">Email updated</h3>
                            <p className="text-sm text-neutral-500 break-all">Changed to {newEmailInput}</p>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    {emailChangeStep === 'input' && (<><Button variant="outline" onClick={handleCancelEmailChange} disabled={isSendingCode}>Cancel</Button><Button onClick={handleSendVerificationCode} disabled={isSendingCode || !newEmailInput.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">{isSendingCode ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : 'Send code'}</Button></>)}
                    {emailChangeStep === 'verify' && (<><Button variant="outline" onClick={handleCancelEmailChange} disabled={isVerifyingCode}>Cancel</Button><Button onClick={handleVerifyEmailCode} disabled={isVerifyingCode || verificationCode.length !== 6} className="bg-amber-600 hover:bg-amber-700 text-white">{isVerifyingCode ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</> : 'Verify'}</Button></>)}
                    {emailChangeStep === 'success' && <Button onClick={handleCancelEmailChange} className="w-full bg-amber-600 hover:bg-amber-700 text-white">Done</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    // Edit basic info — holds the actual inputs (opened from the left card)
    const BasicInfoDialog = (
        <Dialog open={basicInfoOpen} onOpenChange={setBasicInfoOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit basic info</DialogTitle>
                    <DialogDescription>Update your personal and contact details.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="name" className={LABEL}>Full name <span className="text-red-500">*</span></Label>
                        <Input id="name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Enter your full name" className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between"><Label className={LABEL}>Email address</Label>{EmailDialog}</div>
                        <Input value={formData.email} disabled className="bg-neutral-50 border-neutral-200 text-neutral-500" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="linkedin" className={LABEL}>LinkedIn profile</Label>
                        <Input id="linkedin" name="linkedin" value={formData.linkedin} onChange={handleInputChange} placeholder="https://linkedin.com/in/yourprofile" className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="github" className={LABEL}>GitHub profile</Label>
                        <Input id="github" name="github" value={formData.github} onChange={handleInputChange} placeholder="https://github.com/yourusername" className={INPUT} />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => setBasicInfoOpen(false)} className="bg-amber-600 hover:bg-amber-700 text-white">Done</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    return (
        <div className="min-h-screen bg-neutral-100">
            <div className="h-6" />

            <motion.div
                initial={{ opacity: 0, y: 12 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.3 }}
                className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6 grid lg:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start"
            >
                {/* ════════ LEFT: identity ════════ */}
                <aside className="lg:sticky lg:top-8">
                    <div className={`${CARD} p-6`}>
                        <div className="text-center">
                            <Avatar className="h-28 w-28 mx-auto ring-1 ring-neutral-200">
                                <AvatarImage src={user.image} alt={user.name || 'Mentee'} />
                                <AvatarFallback className="bg-amber-100 text-amber-700 text-3xl font-semibold">
                                    {user.name?.slice(0, 2).toUpperCase() || 'ME'}
                                </AvatarFallback>
                            </Avatar>
                            <h2 className="mt-4 text-lg font-bold text-neutral-900 truncate">{formData.name || 'Your name'}</h2>
                            <button type="button" onClick={() => setBasicInfoOpen(true)} className="mt-1 text-sm font-medium text-amber-600 hover:text-amber-700">Edit basic info</button>
                            <div className="mt-2">
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Mentee</span>
                            </div>
                        </div>

                        <div className="mt-4 border-t border-neutral-100 pt-2">
                            <FieldRow label="Full name" value={formData.name} onAdd={() => setBasicInfoOpen(true)} />
                            <FieldRow label="Email address" value={formData.email} onAdd={() => setBasicInfoOpen(true)} />
                            <FieldRow label="LinkedIn" value={formData.linkedin} onAdd={() => setBasicInfoOpen(true)} />
                            <FieldRow label="GitHub" value={formData.github} onAdd={() => setBasicInfoOpen(true)} />
                        </div>
                    </div>
                </aside>

                {/* ════════ RIGHT: editable sections ════════ */}
                <div className="space-y-6 min-w-0">

                    {/* Timezone */}
                    <SectionCard title="Timezone" description="Meeting times will display in your chosen timezone.">
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-3 text-sm text-neutral-600">
                            Showing times in <strong className="text-neutral-900">{timezoneLabel}</strong>.
                        </div>
                        <TimezoneSelector value={timezone} onChange={setTimezone} />
                    </SectionCard>

                    {/* CV & resume */}
                    <SectionCard title="CV & resume" description="Share your CV and control who can see it.">
                        {formData.cv_link && (
                            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium text-neutral-900">CV / resume uploaded</p>
                                        <p className="text-xs text-neutral-500">Your current CV is on file.</p>
                                    </div>
                                </div>
                                <Button size="sm" variant="outline" className="border-neutral-200 hover:bg-white"
                                    onClick={() => {
                                        const cvUrl = formData.cv_link!.startsWith('http')
                                            ? formData.cv_link
                                            : `/api/attachment-proxy?url=${encodeURIComponent(formData.cv_link!)}`;
                                        window.open(cvUrl, '_blank');
                                    }}>
                                    <Eye className="h-4 w-4 mr-1.5" />View
                                </Button>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className={LABEL}>Update CV / resume</Label>
                            <div className="flex gap-2">
                                <Input
                                    type="file"
                                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    onChange={(e) => {
                                        const selectedFile = e.target.files?.[0] || null;
                                        if (!selectedFile) { setCvFile(null); return; }
                                        const cvValidationError = validateCvFile(selectedFile);
                                        if (cvValidationError) { toast({ title: 'Error', description: cvValidationError, variant: 'destructive' }); setCvFile(null); e.target.value = ''; return; }
                                        setCvFile(selectedFile);
                                    }}
                                    className="border-neutral-200" disabled={isUploadingCV}
                                />
                                <Button onClick={handleCVUpload} disabled={!cvFile || isUploadingCV} className="bg-neutral-900 hover:bg-neutral-800 text-white whitespace-nowrap">
                                    {isUploadingCV ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Uploading…</> : <><Upload className="h-4 w-4 mr-1.5" />Upload</>}
                                </Button>
                            </div>
                            <p className="text-xs text-neutral-400">Accepted: PDF, DOCX. Max 2&nbsp;MB.</p>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5">
                            <div className="flex items-start gap-3">
                                <Checkbox id="allow-cv-share-profile" checked={allowCVShare} onCheckedChange={(checked) => setAllowCVShare(checked as boolean)} className="mt-0.5 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600 data-[state=checked]:text-white" />
                                <div className="flex-1">
                                    <label htmlFor="allow-cv-share-profile" className="text-sm font-medium text-neutral-800 cursor-pointer">Allow mentors to view my CV for meeting requests</label>
                                    <p className="text-xs text-neutral-500 mt-0.5">Sharing your CV increases the likelihood of meeting requests being accepted.</p>
                                </div>
                            </div>
                        </div>
                    </SectionCard>

                    {/* Danger zone */}
                    <section className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 sm:p-8">
                        <div className="border-b border-red-100 pb-4 mb-6">
                            <h2 className="text-lg font-bold text-red-700">Danger zone</h2>
                            <p className="text-sm text-neutral-500 mt-1">Permanently delete your account and data.</p>
                        </div>
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <p className="text-sm text-neutral-600 max-w-md">Deleting your account removes your profile and login permanently. This cannot be undone.</p>
                            <Button variant="outline" onClick={() => setDeleteDialogOpen(true)} className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700">
                                <Trash2 className="h-4 w-4 mr-1.5" />Delete account
                            </Button>
                        </div>
                    </section>

                    <div className="flex items-center justify-end gap-3 pb-2">

                        {SaveButton}
                    </div>
                </div>
            </motion.div>

            {BasicInfoDialog}

            <Dialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeleteConfirmText(''); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-red-700">Delete your account?</DialogTitle>
                        <DialogDescription>This permanently deletes your profile, CV, and login from our systems. This cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-sm space-y-1.5">
                                <p>Upcoming meetings will be cancelled and the mentor notified by email. Pending requests you sent are simply withdrawn, no email.</p>
                                <p>If you have a past meeting with an unsubmitted feedback form, you must submit it before you can delete your account.</p>
                                <p>Your profile data will be removed from our database and your login will be deleted — you won't be able to log in again with this email.</p>
                            </AlertDescription>
                        </Alert>
                        <div className="space-y-1.5">
                            <Label className={LABEL}>Type <span className="font-mono font-semibold">DELETE</span> to confirm</Label>
                            <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className={INPUT} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeletingAccount}>Cancel</Button>
                        <Button onClick={handleDeleteAccount} disabled={isDeletingAccount || deleteConfirmText.trim() !== 'DELETE'} className="bg-red-600 hover:bg-red-700 text-white">
                            {isDeletingAccount ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</> : 'Delete my account'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}