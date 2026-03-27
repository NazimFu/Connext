"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Check, X, Eye, Mail, User, Clock, Calendar, Briefcase, Star,
  Shield, ShieldAlert, AlertTriangle, RefreshCcw, Loader2,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, ExternalLink,
  RefreshCw, KeyRound, Activity,
} from "lucide-react";

const DEVELOPER_PASSWORD = "LuminiDev2024!";

/* ─────────────────────────────── TYPES ─────────────────────────────── */
interface MenteeApplication {
  id: string; menteeUID: string; name: string; mentee_name: string;
  mentee_email: string; mentee_age: string; mentee_occupation: string;
  mentee_institution: string; personal_statement?: string;
  _attachments?: string; verification_status: string; createdAt: string;
  reviewedBy?: string; reviewedAt?: string; reviewNotes?: string;
}
interface MentorApplication {
  id: string; mentorUID: string; mentor_name: string; mentor_email: string;
  mentor_company: string; mentor_position: string; mentor_experience: string;
  mentor_expertise: string[]; mentor_bio: string;
  verification_status: string; createdAt: string;
  reviewedBy?: string; reviewedAt?: string; reviewNotes?: string;
}
interface ReportItem {
  meetingId: string; reportType: "mentor_report" | "mentee_report";
  reportStatus: "pending" | "resolved" | "rejected";
  reportReason: string | null; reportFiledByRole: "mentor" | "mentee" | null;
  reportFiledAt: string | null; reportTargetRole: "mentor" | "mentee" | null;
  mentorUID: string | null; mentorName: string | null; mentorEmail: string | null;
  menteeUID: string | null; menteeName: string | null; menteeEmail: string | null;
  decision: string; scheduledStatus: string;
  reportReviewNotes: string | null; reportReviewedAt: string | null; reportReviewedBy: string | null;
  reportFiledByUid: string | null; reportTargetUid: string | null;
}
interface TokenStatus {
  status: "authorized" | "not_authorized";
  has_refresh_token?: boolean; access_token_expires_at?: string;
  access_token_expired?: boolean; scope?: string;
  auth_url: string; message?: string;
}

const REPORT_REASON_OPTIONS = [
  "Inappropriate behavior",
  "Didn't show up",
  "Harassment or abusive language",
  "Spam or misuse of meeting",
  "Policy violation",
  "Custom",
] as const;

/* ─────────────────────────────── STAT CARD ─────────────────────────── */
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
        <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────── STATUS BADGE ──────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    "not-submitted": "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map["not-submitted"]}`}>
      {status}
    </span>
  );
}

/* ─────────────────────────────── PAGINATION ────────────────────────── */
function Pagination({ page, total, perPage, onChange }: {
  page: number; total: number; perPage: number; onChange: (p: number) => void;
}) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
      <span>{Math.min((page - 1) * perPage + 1, total)}–{Math.min(page * perPage, total)} of {total}</span>
      <div className="flex gap-1">
        <button disabled={page === 1} onClick={() => onChange(page - 1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {Array.from({ length: pages }, (_, i) => (
          <button key={i} onClick={() => onChange(i + 1)}
            className={`min-w-[30px] h-[30px] rounded-lg text-xs font-medium transition-colors ${page === i + 1 ? "bg-gray-900 text-white" : "hover:bg-gray-100"}`}>
            {i + 1}
          </button>
        ))}
        <button disabled={page === pages} onClick={() => onChange(page + 1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── MAIN COMPONENT ────────────────────── */
export default function InternalDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Applications
  const [menteeApplications, setMenteeApplications] = useState<MenteeApplication[]>([]);
  const [mentorApplications, setMentorApplications] = useState<MentorApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean; app: MenteeApplication | MentorApplication | null;
    type: "mentee" | "mentor"; decision: "approved" | "rejected";
  }>({ open: false, app: null, type: "mentee", decision: "approved" });
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [pagePendingMentee, setPagePendingMentee] = useState(1);
  const [pagePendingMentor, setPagePendingMentor] = useState(1);
  const [pageReviewedMentee, setPageReviewedMentee] = useState(1);
  const [pageReviewedMentor, setPageReviewedMentor] = useState(1);
  const PER_PAGE = 10;

  // Reports
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportFilter, setReportFilter] = useState<"all" | "pending" | "resolved">("pending");
  const [reportDialog, setReportDialog] = useState<{
    open: boolean; report: ReportItem | null; action: "accept" | "reject" | "reopen";
  }>({ open: false, report: null, action: "accept" });
  const [reportReviewer, setReportReviewer] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [reportActionReason, setReportActionReason] = useState<string>("Inappropriate behavior");
  const [reportActionReasonCustom, setReportActionReasonCustom] = useState("");
  const [reportUpdating, setReportUpdating] = useState(false);

  // Cancellations
  const [cancellations, setCancellations] = useState<any[]>([]);
  const [cancellationsLoading, setCancellationsLoading] = useState(false);
  const [cancelFilter, setCancelFilter] = useState<"all" | "pending" | "resolved">("pending");
  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean; item: any; action: "approve" | "reject";
  }>({ open: false, item: null, action: "approve" });
  const [cancelReviewer, setCancelReviewer] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelUpdating, setCancelUpdating] = useState(false);

  // Google Auth
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenFlash, setTokenFlash] = useState<{ type: "success" | "error"; text: string } | null>(null);

  /* ── auth ── */
  const handleLogin = () => {
    if (password === DEVELOPER_PASSWORD) { setIsAuthenticated(true); setAuthError(""); }
    else setAuthError("Invalid password.");
  };

  /* ── fetch ── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, rpts, cnls] = await Promise.all([
        fetch("/api/internal/applications").then(r => r.json()),
        fetch("/api/reports").then(r => r.json()),
        fetch("/api/meetings/cancel").then(r => r.json()),
      ]);
      setMenteeApplications(apps.mentees ?? []);
      setMentorApplications(apps.mentors ?? []);
      setReports(rpts ?? []);
      setCancellations(cnls ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetchTokenStatus = useCallback(async () => {
    setTokenLoading(true);
    try {
      const data = await fetch("/api/admin/google-auth").then(r => r.json());
      setTokenStatus(data);
    } catch { setTokenFlash({ type: "error", text: "Failed to fetch token status." }); }
    finally { setTokenLoading(false); }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchAll();
    fetchTokenStatus();
    // Check OAuth callback params
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      setTokenFlash({ type: "success", text: "Google Calendar authorized successfully!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("error")) {
      setTokenFlash({ type: "error", text: `Authorization failed: ${decodeURIComponent(params.get("error")!)}` });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [isAuthenticated, fetchAll, fetchTokenStatus]);

  /* ── review ── */
  const handleReview = async () => {
    if (!reviewDialog.app || !reviewerName.trim()) return;
    try {
      await fetch("/api/internal/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: reviewDialog.app.id,
          applicationType: reviewDialog.type,
          decision: reviewDialog.decision,
          notes: reviewNotes,
          reviewerName: reviewerName.trim(),
        }),
      });
      setReviewDialog({ open: false, app: null, type: "mentee", decision: "approved" });
      setReviewNotes(""); setReviewerName("");
      fetchAll();
    } catch { alert("Error processing review"); }
  };

  /* ── reports ── */
  const handleUpdateReport = async () => {
    if (!reportDialog.report) return;
    if (reportDialog.action !== "reopen" && !reportReviewer.trim()) { alert("Please provide your name."); return; }
    const selectedReason = reportActionReason === "Custom" ? reportActionReasonCustom.trim() : reportActionReason;
    if (reportDialog.action === "accept" && !selectedReason) {
      alert("Please select a reason or enter a custom reason.");
      return;
    }
    setReportUpdating(true);
    try {
      await fetch("/api/reports", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId: reportDialog.report.meetingId,
          reportType: reportDialog.report.reportType,
          status: reportDialog.action === "accept" ? "resolved" : reportDialog.action === "reject" ? "rejected" : "pending",
          reviewerName: reportDialog.action !== "reopen" ? reportReviewer.trim() : undefined,
          reviewNotes: reportNotes,
          actionReason: reportDialog.action === "accept" ? selectedReason : undefined,
        }),
      });
      setReportDialog({ open: false, report: null, action: "accept" });
      setReportReviewer(""); setReportNotes("");
      setReportActionReason("Inappropriate behavior");
      setReportActionReasonCustom("");
      const data = await fetch("/api/reports").then(r => r.json());
      setReports(data ?? []);
    } catch { alert("Error updating report."); }
    finally { setReportUpdating(false); }
  };

  /* ── cancellations ── */
  const handleCancelReview = async () => {
    if (!cancelDialog.item || !cancelReviewer.trim()) { alert("Please provide your name."); return; }
    setCancelUpdating(true);
    try {
      await fetch("/api/meetings/cancel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId: cancelDialog.item.meetingId,
          action: cancelDialog.action,
          reviewerName: cancelReviewer.trim(),
          reviewNotes: cancelNotes,
        }),
      });
      setCancelDialog({ open: false, item: null, action: "approve" });
      setCancelReviewer(""); setCancelNotes("");
      const data = await fetch("/api/meetings/cancel").then(r => r.json());
      setCancellations(data ?? []);
    } catch { alert("Error reviewing cancellation."); }
    finally { setCancelUpdating(false); }
  };

  /* ── google auth ── */
  /* ── derived ── */
  const pendingMentees = menteeApplications.filter(a => a.verification_status === "pending" || a.verification_status === "not-submitted");
  const pendingMentors = mentorApplications.filter(a => a.verification_status === "pending" || a.verification_status === "not-submitted");
  const reviewedMentees = menteeApplications.filter(a => a.verification_status === "approved" || a.verification_status === "rejected");
  const reviewedMentors = mentorApplications.filter(a => a.verification_status === "approved" || a.verification_status === "rejected");
  const pendingReports = reports.filter(r => r.reportStatus === "pending");
  const pendingCancels = cancellations.filter(c => c.cancelInfo?.tokenStatus === "pending-approval");
  const filteredReports = useMemo(() => {
    if (reportFilter === "pending") return reports.filter(r => r.reportStatus === "pending");
    if (reportFilter === "resolved") return reports.filter(r => r.reportStatus === "resolved" || r.reportStatus === "rejected");
    return reports;
  }, [reports, reportFilter]);
  const filteredCancels = useMemo(() => {
    if (cancelFilter === "pending") return cancellations.filter(c => c.cancelInfo?.tokenStatus === "pending-approval");
    if (cancelFilter === "resolved") return cancellations.filter(c => ["approved-replenished", "rejected", "auto-replenished"].includes(c.cancelInfo?.tokenStatus));
    return cancellations;
  }, [cancellations, cancelFilter]);

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtDateShort = (s: string | null) => s ? new Date(s).toLocaleString() : "—";

  /* ─── LOGIN SCREEN ─── */
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-900 rounded-2xl mb-4">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Internal Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Enter your admin password to continue</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">Password</Label>
              <Input
                type="password" value={password} className="mt-1.5"
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="Enter admin password"
              />
            </div>
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <Button onClick={handleLogin} className="w-full bg-gray-900 hover:bg-gray-800 text-white">
              Access Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── DASHBOARD ─── */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">Admin Dashboard</span>
            {(pendingMentees.length + pendingMentors.length + pendingReports.length + pendingCancels.length) > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                {pendingMentees.length + pendingMentors.length + pendingReports.length + pendingCancels.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading} className="text-gray-500 hover:text-gray-700">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsAuthenticated(false)} className="text-gray-500 hover:text-gray-700">
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Tabs defaultValue="applications">
          <TabsList className="bg-white border border-gray-200 shadow-sm rounded-xl p-1 gap-1 h-auto mb-6">
            {[
              { value: "applications", label: "Applications", badge: pendingMentees.length + pendingMentors.length },
              { value: "cancellations", label: "Cancellations", badge: pendingCancels.length },
              { value: "reports", label: "Reports", badge: pendingReports.length },
              { value: "google-auth", label: "Google Auth", badge: tokenStatus?.access_token_expired ? 1 : 0 },
            ].map(t => (
              <TabsTrigger key={t.value} value={t.value}
                className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=active]:shadow-sm flex items-center gap-2">
                {t.label}
                {t.badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {t.badge > 9 ? "9+" : t.badge}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ══════════════ APPLICATIONS ══════════════ */}
          <TabsContent value="applications">
            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
            ) : (
              <>
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <StatCard label="Pending Mentees" value={pendingMentees.length} color="text-amber-600" />
                  <StatCard label="Pending Mentors" value={pendingMentors.length} color="text-amber-600" />
                  <StatCard label="Total Mentees" value={menteeApplications.length} color="text-gray-900" />
                  <StatCard label="Total Mentors" value={mentorApplications.length} color="text-gray-900" />
                </div>

                <Tabs defaultValue="pending">
                  <TabsList className="bg-gray-100 rounded-lg p-0.5 mb-4">
                    <TabsTrigger value="pending" className="rounded-md px-4 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      Pending ({pendingMentees.length + pendingMentors.length})
                    </TabsTrigger>
                    <TabsTrigger value="reviewed" className="rounded-md px-4 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      Reviewed ({reviewedMentees.length + reviewedMentors.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="pending">
                    <Tabs defaultValue="mentees">
                      <TabsList className="bg-gray-100 rounded-lg p-0.5 mb-4">
                        <TabsTrigger value="mentees" className="rounded-md px-4 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                          Mentees ({pendingMentees.length})
                        </TabsTrigger>
                        <TabsTrigger value="mentors" className="rounded-md px-4 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                          Mentors ({pendingMentors.length})
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="mentees">
                        <ApplicationList items={pendingMentees.slice((pagePendingMentee - 1) * PER_PAGE, pagePendingMentee * PER_PAGE)}
                          type="mentee" isPending onReview={(app, decision) => { setReviewDialog({ open: true, app, type: "mentee", decision }); setReviewNotes(""); setReviewerName(""); }} fmtDate={fmtDate} />
                        <Pagination page={pagePendingMentee} total={pendingMentees.length} perPage={PER_PAGE} onChange={setPagePendingMentee} />
                      </TabsContent>
                      <TabsContent value="mentors">
                        <ApplicationList items={pendingMentors.slice((pagePendingMentor - 1) * PER_PAGE, pagePendingMentor * PER_PAGE)}
                          type="mentor" isPending onReview={(app, decision) => { setReviewDialog({ open: true, app, type: "mentor", decision }); setReviewNotes(""); setReviewerName(""); }} fmtDate={fmtDate} />
                        <Pagination page={pagePendingMentor} total={pendingMentors.length} perPage={PER_PAGE} onChange={setPagePendingMentor} />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  <TabsContent value="reviewed">
                    <Tabs defaultValue="mentees">
                      <TabsList className="bg-gray-100 rounded-lg p-0.5 mb-4">
                        <TabsTrigger value="mentees" className="rounded-md px-4 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">Mentees ({reviewedMentees.length})</TabsTrigger>
                        <TabsTrigger value="mentors" className="rounded-md px-4 py-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">Mentors ({reviewedMentors.length})</TabsTrigger>
                      </TabsList>
                      <TabsContent value="mentees">
                        <ApplicationList items={reviewedMentees.slice((pageReviewedMentee - 1) * PER_PAGE, pageReviewedMentee * PER_PAGE)} type="mentee" isPending={false} onReview={() => {}} fmtDate={fmtDate} />
                        <Pagination page={pageReviewedMentee} total={reviewedMentees.length} perPage={PER_PAGE} onChange={setPageReviewedMentee} />
                      </TabsContent>
                      <TabsContent value="mentors">
                        <ApplicationList items={reviewedMentors.slice((pageReviewedMentor - 1) * PER_PAGE, pageReviewedMentor * PER_PAGE)} type="mentor" isPending={false} onReview={() => {}} fmtDate={fmtDate} />
                        <Pagination page={pageReviewedMentor} total={reviewedMentors.length} perPage={PER_PAGE} onChange={setPageReviewedMentor} />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </TabsContent>

          {/* ══════════════ CANCELLATIONS ══════════════ */}
          <TabsContent value="cancellations">
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard label="Pending" value={pendingCancels.length} color="text-amber-600" />
              <StatCard label="Resolved" value={cancellations.filter(c => ["approved-replenished", "rejected", "auto-replenished"].includes(c.cancelInfo?.tokenStatus)).length} color="text-emerald-600" />
              <StatCard label="Total" value={cancellations.length} color="text-gray-900" />
            </div>
            <div className="flex gap-2 mb-4">
              {(["all", "pending", "resolved"] as const).map(f => (
                <button key={f} onClick={() => setCancelFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${cancelFilter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            {cancellationsLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              : filteredCancels.length === 0 ? <EmptyState icon={<Check className="h-8 w-8" />} text="No cancellations found" />
              : (
                <div className="space-y-3">
                  {filteredCancels.map(c => (
                    <CancellationCard key={c.meetingId} item={c} fmtDate={fmtDateShort}
                      onApprove={() => { setCancelDialog({ open: true, item: c, action: "approve" }); setCancelReviewer(""); setCancelNotes(""); }}
                      onReject={() => { setCancelDialog({ open: true, item: c, action: "reject" }); setCancelReviewer(""); setCancelNotes(""); }} />
                  ))}
                </div>
              )}
          </TabsContent>

          {/* ══════════════ REPORTS ══════════════ */}
          <TabsContent value="reports">
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard label="Pending" value={pendingReports.length} color="text-amber-600" />
              <StatCard label="Resolved" value={reports.filter(r => r.reportStatus === "resolved" || r.reportStatus === "rejected").length} color="text-emerald-600" />
              <StatCard label="Total" value={reports.length} color="text-gray-900" />
            </div>
            <div className="flex gap-2 mb-4">
              {(["all", "pending", "resolved"] as const).map(f => (
                <button key={f} onClick={() => setReportFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${reportFilter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            {reportsLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              : filteredReports.length === 0 ? <EmptyState icon={<Check className="h-8 w-8" />} text="No reports found" />
              : (
                <div className="space-y-3">
                  {filteredReports.map(r => (
                    <ReportCard key={`${r.meetingId}-${r.reportType}`} report={r} fmtDate={fmtDateShort}
                      onAccept={() => { setReportDialog({ open: true, report: r, action: "accept" }); setReportReviewer(""); setReportNotes(""); setReportActionReason("Inappropriate behavior"); setReportActionReasonCustom(""); }}
                      onReject={() => { setReportDialog({ open: true, report: r, action: "reject" }); setReportReviewer(""); setReportNotes(""); setReportActionReason("Inappropriate behavior"); setReportActionReasonCustom(""); }}
                      onReopen={() => { setReportDialog({ open: true, report: r, action: "reopen" }); setReportReviewer(""); setReportNotes(""); setReportActionReason("Inappropriate behavior"); setReportActionReasonCustom(""); }} />
                  ))}
                </div>
              )}
          </TabsContent>

          {/* ══════════════ GOOGLE AUTH ══════════════ */}
          <TabsContent value="google-auth">
            <div className="max-w-2xl space-y-4">
              {tokenFlash && (
                <Alert variant={tokenFlash.type === "error" ? "destructive" : "default"}>
                  {tokenFlash.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertDescription>{tokenFlash.text}</AlertDescription>
                </Alert>
              )}

              {/* Status card */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Token Status
                  </h2>
                  <Button variant="ghost" size="sm" onClick={fetchTokenStatus} disabled={tokenLoading} className="text-gray-500">
                    {tokenLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>

                {tokenLoading && !tokenStatus ? (
                  <div className="flex items-center gap-2 text-gray-400 py-4"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading...</span></div>
                ) : tokenStatus ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {tokenStatus.status === "authorized" ? (
                        <><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <span className="font-medium text-emerald-700 text-sm">Authorized</span>
                          {tokenStatus.access_token_expired && <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Access token expired (auto-refreshes)</span>}
                        </>
                      ) : (
                        <><div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                          <span className="font-medium text-red-700 text-sm">Not authorized</span>
                        </>
                      )}
                    </div>

                    {tokenStatus.status === "authorized" && (
                      <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>Refresh token stored</span>
                          <span className={tokenStatus.has_refresh_token ? "text-emerald-600 font-medium" : "text-red-600"}>
                            {tokenStatus.has_refresh_token ? "Yes" : "No"}
                          </span>
                        </div>
                        {tokenStatus.access_token_expires_at && (
                          <div className="flex justify-between text-gray-600">
                            <span>Access token expires</span>
                            <span className="font-mono text-xs text-gray-700">{new Date(tokenStatus.access_token_expires_at).toLocaleString()}</span>
                          </div>
                        )}
                        {tokenStatus.scope && (
                          <div className="flex justify-between text-gray-600">
                            <span>Scope</span>
                            <span className="font-mono text-xs truncate max-w-xs text-gray-700">{tokenStatus.scope}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700">
                      Access tokens expire hourly and auto-renew. The refresh token stays valid as long as the app is used at least once every 6 months.
                    </div>

                  </div>
                ) : null}
              </div>

              {/* Auth card */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
                  <KeyRound className="h-4 w-4" />
                  {tokenStatus?.status === "authorized" ? "Re-authorize" : "Authorize Google Calendar"}
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  {tokenStatus?.status === "authorized"
                    ? "Only needed if tokens were revoked or you switched Google accounts."
                    : "One-time setup to grant CONNEXT access to your Google Calendar."}
                </p>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Before authorizing</p>
                      <p>Make sure <code className="bg-amber-100 px-1 rounded">GOOGLE_OAUTH_REDIRECT_URI</code> is set and matches your Google Cloud Console OAuth 2.0 client.</p>
                      <p className="mt-1 font-mono text-xs break-all">
                        {typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com"}/api/admin/google-auth/callback
                      </p>
                    </div>
                  </div>
                </div>

                {tokenStatus?.auth_url && (
                  <Button asChild className="w-full bg-gray-900 hover:bg-gray-800 text-white gap-2">
                    <a href={tokenStatus.auth_url}>
                      <ExternalLink className="h-4 w-4" />
                      {tokenStatus.status === "authorized" ? "Re-authorize with Google" : "Authorize with Google"}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ══ Review Dialog ══ */}
      <AlertDialog open={reviewDialog.open} onOpenChange={open => setReviewDialog(d => ({ ...d, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{reviewDialog.decision === "approved" ? "Approve" : "Reject"} Application</AlertDialogTitle>
            <AlertDialogDescription>
              {reviewDialog.decision === "approved" ? "They will gain access to the platform." : "They will be notified of the rejection."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 space-y-3">
            <div>
              <Label>Reviewer Name <span className="text-red-500">*</span></Label>
              <Input value={reviewerName} onChange={e => setReviewerName(e.target.value)} placeholder="Your name" className="mt-1.5" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Internal notes..." className="mt-1.5" />
              <p className="text-xs text-gray-400 mt-1">Not shared with the applicant.</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReview}
              className={reviewDialog.decision === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}>
              {reviewDialog.decision === "approved" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ Report Dialog ══ */}
      <AlertDialog open={reportDialog.open} onOpenChange={open => setReportDialog(d => ({ ...d, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reportDialog.action === "accept" ? "Accept Report" : reportDialog.action === "reject" ? "Reject Report" : "Reopen Report"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reportDialog.action === "accept" ? "Accepting will immediately forfeit the cycle token and send an email notification." : reportDialog.action === "reject" ? "No penalty will be applied." : "Reopen for further review."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 space-y-3">
            {reportDialog.action !== "reopen" && (
              <div>
                <Label>Reviewer Name <span className="text-red-500">*</span></Label>
                <Input value={reportReviewer} onChange={e => setReportReviewer(e.target.value)} placeholder="Your name" className="mt-1.5" />
              </div>
            )}
            {reportDialog.action === "accept" && (
              <div>
                <Label>Reason To Include In Email <span className="text-red-500">*</span></Label>
                <select
                  value={reportActionReason}
                  onChange={(e) => setReportActionReason(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {REPORT_REASON_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                {reportActionReason === "Custom" && (
                  <Input
                    value={reportActionReasonCustom}
                    onChange={e => setReportActionReasonCustom(e.target.value)}
                    placeholder="Type custom reason"
                    className="mt-2"
                  />
                )}
                <p className="text-xs text-gray-400 mt-1">The selected reason will be sent to the reported user.</p>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea value={reportNotes} onChange={e => setReportNotes(e.target.value)} placeholder="Add notes..." className="mt-1.5" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reportUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateReport} disabled={reportUpdating}
              className={reportDialog.action === "accept" ? "bg-emerald-600 hover:bg-emerald-700" : reportDialog.action === "reject" ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600"}>
              {reportUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : reportDialog.action === "accept" ? "Accept & Penalize" : reportDialog.action === "reject" ? "Reject" : "Reopen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ Cancel Dialog ══ */}
      <AlertDialog open={cancelDialog.open} onOpenChange={open => setCancelDialog(d => ({ ...d, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{cancelDialog.action === "approve" ? "Approve Cancellation" : "Reject Cancellation"}</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelDialog.action === "approve" ? "1 token will be replenished to the requester." : "Token will NOT be replenished."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 space-y-3">
            <div>
              <Label>Reviewer Name <span className="text-red-500">*</span></Label>
              <Input value={cancelReviewer} onChange={e => setCancelReviewer(e.target.value)} placeholder="Your name" className="mt-1.5" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={cancelNotes} onChange={e => setCancelNotes(e.target.value)} placeholder="Add notes..." className="mt-1.5" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelReview} disabled={cancelUpdating}
              className={cancelDialog.action === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}>
              {cancelUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : cancelDialog.action === "approve" ? "Approve & Replenish" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─────────────────────────────── SUB-COMPONENTS ────────────────────── */

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="mb-3">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function ApplicationList({ items, type, isPending, onReview, fmtDate }: {
  items: (MenteeApplication | MentorApplication)[];
  type: "mentee" | "mentor"; isPending: boolean;
  onReview: (app: any, decision: "approved" | "rejected") => void;
  fmtDate: (s: string) => string;
}) {
  if (items.length === 0) return <EmptyState icon={<User className="h-8 w-8" />} text="No applications" />;
  return (
    <div className="space-y-3">
      {items.map(app => {
        const name = type === "mentee" ? (app as MenteeApplication).mentee_name || (app as MenteeApplication).name : (app as MentorApplication).mentor_name;
        const email = type === "mentee" ? (app as MenteeApplication).mentee_email : (app as MentorApplication).mentor_email;
        const isReviewed = !isPending;
        return (
          <div key={app.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-semibold text-gray-900">{name}</span>
                  <StatusBadge status={app.verification_status} />
                </div>
                <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />{email}
                </p>
                {type === "mentee" && (
                  <div className="flex gap-4 mt-2 text-sm text-gray-500">
                    {(app as MenteeApplication).mentee_age && <span>Age: {(app as MenteeApplication).mentee_age}</span>}
                    {(app as MenteeApplication).mentee_occupation && <span>{(app as MenteeApplication).mentee_occupation}</span>}
                    {(app as MenteeApplication).mentee_institution && <span>{(app as MenteeApplication).mentee_institution}</span>}
                  </div>
                )}
                {type === "mentor" && (
                  <div className="flex gap-4 mt-2 text-sm text-gray-500">
                    {(app as MentorApplication).mentor_company && <span>{(app as MentorApplication).mentor_company}</span>}
                    {(app as MentorApplication).mentor_position && <span>{(app as MentorApplication).mentor_position}</span>}
                  </div>
                )}
                {(app as MenteeApplication).personal_statement && (
                  <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-2.5 line-clamp-2">{(app as MenteeApplication).personal_statement}</p>
                )}
                {(app as MenteeApplication)._attachments && (
                  <button onClick={() => {
                    const url = (app as MenteeApplication)._attachments!.startsWith("http")
                      ? (app as MenteeApplication)._attachments
                      : `/api/attachment-proxy?url=${encodeURIComponent((app as MenteeApplication)._attachments!)}`;
                    window.open(url, "_blank");
                  }} className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> View CV
                  </button>
                )}
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><Clock className="h-3 w-3" /> Applied {fmtDate(app.createdAt)}</p>
                {isReviewed && app.reviewedBy && (
                  <p className="text-xs text-gray-400 mt-1">Reviewed by {app.reviewedBy}{app.reviewedAt ? ` · ${fmtDate(app.reviewedAt)}` : ""}</p>
                )}
              </div>
              {isPending && (
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" onClick={() => onReview(app, "approved")} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs gap-1">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onReview(app, "rejected")} className="border-red-200 text-red-600 hover:bg-red-50 h-8 px-3 text-xs gap-1">
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CancellationCard({ item, fmtDate, onApprove, onReject }: {
  item: any; fmtDate: (s: string | null) => string; onApprove: () => void; onReject: () => void;
}) {
  const status = item.cancelInfo?.tokenStatus;
  const isPending = status === "pending-approval";
  return (
    <div className={`bg-white border rounded-xl p-5 shadow-sm border-l-4 ${isPending ? "border-l-amber-400 border-gray-200" : status === "approved-replenished" || status === "auto-replenished" ? "border-l-emerald-400 border-gray-200" : "border-l-red-400 border-gray-200"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-gray-800 text-sm font-mono">{item.meetingId}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isPending ? "bg-amber-100 text-amber-700" : status === "approved-replenished" ? "bg-emerald-100 text-emerald-700" : status === "auto-replenished" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
              {isPending ? "Pending" : status === "approved-replenished" ? "Approved" : status === "auto-replenished" ? "Auto-refunded" : "Rejected"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-2">
            <span><strong>Mentee:</strong> {item.menteeName}</span>
            <span><strong>Mentor:</strong> {item.mentorName}</span>
            <span><strong>Date:</strong> {item.date} at {item.time}</span>
            <span><strong>Cancelled:</strong> {fmtDate(item.cancelledAt)}</span>
          </div>
          {item.cancelReason && <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-2 mt-1">{item.cancelReason}</p>}
        </div>
        {isPending && (
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" onClick={onApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs gap-1">
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={onReject} className="border-red-200 text-red-600 hover:bg-red-50 h-8 px-3 text-xs gap-1">
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportCard({ report, fmtDate, onAccept, onReject, onReopen }: {
  report: ReportItem; fmtDate: (s: string | null) => string;
  onAccept: () => void; onReject: () => void; onReopen: () => void;
}) {
  const isPending = report.reportStatus === "pending";
  const isResolved = report.reportStatus === "resolved";
  const isRejected = report.reportStatus === "rejected";
  return (
    <div className={`bg-white border rounded-xl p-5 shadow-sm border-l-4 ${isPending ? "border-l-amber-400 border-gray-200" : isResolved ? "border-l-emerald-400 border-gray-200" : "border-l-red-400 border-gray-200"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-sm">{report.reportType === "mentor_report" ? "Mentor's Report" : "Mentee's Report"}</span>
            <span className="font-mono text-xs text-gray-400">{report.meetingId}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isPending ? "bg-amber-100 text-amber-700" : isResolved ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {isPending ? "Pending" : isResolved ? "Accepted" : "Rejected"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-2">
            <span><strong>Mentor:</strong> {report.mentorName ?? "—"}</span>
            <span><strong>Mentee:</strong> {report.menteeName ?? "—"}</span>
            <span><strong>Filed by:</strong> {report.reportFiledByRole ?? "—"}</span>
            <span><strong>Filed:</strong> {fmtDate(report.reportFiledAt)}</span>
          </div>
          {report.reportReason && <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-2 mt-1">{report.reportReason}</p>}
          {report.reportReviewNotes && <p className="text-xs text-gray-400 mt-2 italic">{report.reportReviewNotes}</p>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {isPending ? (
            <>
              <Button size="sm" onClick={onAccept} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs gap-1">
                <Check className="h-3.5 w-3.5" /> Accept
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} className="border-red-200 text-red-600 hover:bg-red-50 h-8 px-3 text-xs gap-1">
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onReopen} className="h-8 px-3 text-xs gap-1">
              <RefreshCcw className="h-3.5 w-3.5" /> Reopen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}