"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";

// Same value as DEVELOPER_PASSWORD in src/app/internal/dashboard/page.tsx and
// ADMIN_API_SECRET in .env — keep all three in sync if you change it.
const ADMIN_PASSWORD = "LuminiDev2024!";

interface MeetingDetail {
  meetingId: string;
  role: "mentor" | "mentee";
  counterpartName: string;
  date: string;
  time: string;
  message: string;
  feedbackSubmitted: boolean;
  status: "upcoming" | "completed" | "cancelled" | "rejected";
}

interface AccountDetail {
  id: string;
  name: string;
  email: string;
  createdAt: number | string | null;
  tokens: number;
  tokenCycle: {
    status: "pending" | "replenished" | "forfeited";
    replenishState: {
      status: "not_pending" | "waiting_for_feedback" | "waiting_for_cooldown" | "ready_to_replenish";
      message: string;
      daysRemaining?: number;
      minutesRemaining?: number;
    };
    progressPercent: number;
  } | null;
}

const TOKEN_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  not_pending: { label: "No active cycle", className: "bg-gray-100 text-gray-600" },
  waiting_for_feedback: { label: "Waiting for feedback", className: "bg-amber-100 text-amber-700" },
  waiting_for_cooldown: { label: "Cooldown", className: "bg-blue-100 text-blue-700" },
  ready_to_replenish: { label: "Ready to replenish", className: "bg-green-100 text-green-700" },
};

const MEETING_STATUS_BADGE: Record<MeetingDetail["status"], { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", className: "bg-gray-100 text-gray-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

type MeetingSort = "newest" | "oldest" | "ongoing-first";

const MEETING_SORT_OPTIONS: { value: MeetingSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "ongoing-first", label: "Ongoing/upcoming first" },
];

// Handles both "HH:MM" (24h) and "HH:MM AM/PM" (12h) time strings.
function timeToMinutesOfDay(t: string): number {
  if (!t) return 0;
  if (t.includes("AM") || t.includes("PM")) {
    const [raw, period] = t.split(" ");
    let [h, m] = raw.split(":").map(Number);
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return h * 60 + (m || 0);
  }
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function meetingSortKey(m: MeetingDetail): number {
  const dateNum = Number(m.date.replace(/-/g, "")) || 0;
  return dateNum * 10000 + timeToMinutesOfDay(m.time);
}

export default function AccountDetailPage() {
  const params = useParams<{ role: string; id: string }>();
  const role = params.role === "mentor" ? "mentor" : params.role === "mentee" ? "mentee" : null;
  const id = decodeURIComponent(params.id ?? "");

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [meetings, setMeetings] = useState<MeetingDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const [meetingSearch, setMeetingSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [meetingSort, setMeetingSort] = useState<MeetingSort>("newest");

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setAuthError("");
    } else {
      setAuthError("Invalid password.");
    }
  };

  const fetchDetail = useCallback(async () => {
    if (!role || !id) return;
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch(`/api/internal/token-accounts/detail?role=${role}&id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load account");
      setAccount(data.account);
      setMeetings(data.meetings ?? []);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, [role, id, password]);

  useEffect(() => {
    if (isAuthenticated) fetchDetail();
  }, [isAuthenticated, fetchDetail]);

  const visibleMeetings = useMemo(() => {
    const q = meetingSearch.trim().toLowerCase();
    let list = meetings;
    if (q) {
      list = list.filter(m => m.counterpartName.toLowerCase().includes(q) || m.message.toLowerCase().includes(q));
    }
    if (dateFrom) list = list.filter(m => m.date >= dateFrom);
    if (dateTo) list = list.filter(m => m.date <= dateTo);

    const sorted = [...list];
    if (meetingSort === "oldest") {
      sorted.sort((a, b) => meetingSortKey(a) - meetingSortKey(b));
    } else if (meetingSort === "ongoing-first") {
      sorted.sort((a, b) => {
        const aOngoing = a.status === "upcoming" ? 0 : 1;
        const bOngoing = b.status === "upcoming" ? 0 : 1;
        if (aOngoing !== bOngoing) return aOngoing - bOngoing;
        return meetingSortKey(b) - meetingSortKey(a);
      });
    } else {
      sorted.sort((a, b) => meetingSortKey(b) - meetingSortKey(a));
    }
    return sorted;
  }, [meetings, meetingSearch, dateFrom, dateTo, meetingSort]);

  if (!role) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-500">Invalid account link.</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-900 rounded-2xl mb-4">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Account Detail</h1>
            <p className="text-gray-500 text-sm mt-1">Enter your admin password to continue</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">Password</Label>
              <Input
                type="password"
                value={password}
                className="mt-1.5"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Enter admin password"
              />
            </div>
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <Button onClick={handleLogin} className="w-full bg-gray-900 hover:bg-gray-800 text-white">
              Access
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const badge = account?.tokenCycle
    ? TOKEN_STATUS_BADGE[account.tokenCycle.replenishState.status]
    : TOKEN_STATUS_BADGE.not_pending;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/internal/dashboard" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <span className="text-xs uppercase tracking-wide text-gray-400 font-medium">
            {role === "mentor" ? "Mentor Account" : "Mentee Account"}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {fetchError && <p className="text-sm text-red-600">{fetchError}</p>}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : account ? (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h1 className="text-xl font-bold text-gray-900">{account.name || "—"}</h1>
              <p className="text-gray-500 text-sm mt-0.5">{account.email || "—"}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Tokens</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{account.tokens}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Token Status</p>
                  <Badge className={`${badge.className} mt-1.5`}>{badge.label}</Badge>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Replenish Progress</p>
                  <Progress value={account.tokenCycle?.progressPercent ?? 100} className="h-2.5 mt-2" />
                  <p className="text-xs text-gray-400 mt-1">{account.tokenCycle?.progressPercent ?? 100}%</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                <h2 className="font-semibold text-gray-900">
                  Meetings ({visibleMeetings.length}{visibleMeetings.length !== meetings.length ? ` of ${meetings.length}` : ""})
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <Label className="text-xs text-gray-500">Search</Label>
                    <Input
                      value={meetingSearch}
                      onChange={e => setMeetingSearch(e.target.value)}
                      placeholder="Counterpart name or message..."
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">From date</Label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">To date</Label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Sort</Label>
                    <select
                      value={meetingSort}
                      onChange={e => setMeetingSort(e.target.value as MeetingSort)}
                      className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 h-9"
                    >
                      {MEETING_SORT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {(meetingSearch || dateFrom || dateTo) && (
                    <Button variant="ghost" size="sm" className="text-gray-500"
                      onClick={() => { setMeetingSearch(""); setDateFrom(""); setDateTo(""); }}>
                      Clear filters
                    </Button>
                  )}
                </div>
              </div>
              {visibleMeetings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">
                  {meetings.length === 0 ? "No meetings found." : "No meetings match these filters."}
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {visibleMeetings.map((m) => {
                    const statusBadge = MEETING_STATUS_BADGE[m.status];
                    return (
                      <div key={m.meetingId} className="px-5 py-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="font-medium text-gray-900">
                            {m.counterpartName} <span className="text-gray-400 font-normal">— as {m.role}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
                            {m.feedbackSubmitted ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Feedback: Yes</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="h-3.5 w-3.5" />Feedback: No</span>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">{m.date} · {m.time}</div>
                        {m.message && <div className="text-xs text-gray-500 mt-1 italic">"{m.message}"</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
