'use client'

// src/app/mentee/profile/edit/page.tsx
//
// Redesigned to match the mentor edit page: Fresha-style cards, amber brand,
// neutral grayscale, minimal semantic colors. Left = identity summary,
// right = editable section cards. All logic/data flow unchanged.

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRequireAuth } from "@/hooks/use-auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, Eye, Upload, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useEffect, useState } from 'react'
import { motion } from "framer-motion"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
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
    const { toast } = useToast();

    const [formData, setFormData] = useState({ name: '', email: '', linkedin: '', github: '', cv_link: '' });
    const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
    const [isSaving, setIsSaving] = useState(false);
    const [cvFile, setCvFile] = useState<File | null>(null);
    const [isUploadingCV, setIsUploadingCV] = useState(false);
    const [allowCVShare, setAllowCVShare] = useState(false);
    const [basicInfoOpen, setBasicInfoOpen] = useState(false);

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
            toast({ title: 'Profile updated', description: 'Your profile has been saved.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update profile. Please try again.', variant: 'destructive' });
        } finally { setIsSaving(false); }
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
                        <Label htmlFor="email" className={LABEL}>Email address</Label>
                        <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="your.email@example.com" className={INPUT} />
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

                    <div className="flex items-center justify-end gap-3 pb-2">
                        
                        {SaveButton}
                    </div>
                </div>
            </motion.div>

            {BasicInfoDialog}
        </div>
    )
}