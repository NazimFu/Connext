# Token Lifecycle Implementation Guide

This document describes the complete implementation of the token lifecycle logic for Studio Master.

## Overview

The token lifecycle manages how mentees request meetings (costing 1 token) and how tokens are replenished based on:
1. **Request Window**: Meeting must be 1-4 weeks away
2. **Feedback Requirement**: Mentee must submit feedback at least 2 hours after meeting
3. **Cooldown Period**: 1 month must pass before token replenishment
4. **Safety Checks**: No duplicate replenishment, proper timestamp handling

## Constants (in `src/lib/token-cycle.ts`)

```typescript
const REQUEST_WINDOW_DAYS_MIN = 7;          // 1 week minimum
const REQUEST_WINDOW_DAYS_MAX = 30;         // 1 month maximum
const FEEDBACK_UNLOCK_HOURS = 2;             // 2 hours after meeting
const REPLENISHMENT_COOLDOWN_MONTHS = 1;    // 1 month cooldown
```

## Core Utility Functions

### `getDisplayMeetingDateTime(dateStr, timeStr, referenceTimezone, displayTimezone): { displayDate, displayTime } | null`
Converts a stored meeting date/time from one timezone to another for display.
- Takes meeting date/time stored in reference timezone (e.g., mentee's timezone when request was made)
- Converts through UTC to the viewer's timezone
- Returns display-ready date and time strings
- Preserves time format (12-hour stays 12-hour, 24-hour stays 24-hour)
- Handles day boundary crossing (e.g., meeting at 11 PM in one timezone might be next day in another)

**Example:**
```typescript
// Mentee creates request for 2026-05-15 11:00 AM (Asia/Kuala_Lumpur)
// Mentor viewing in America/New_York sees:
getDisplayMeetingDateTime('2026-05-15', '11:00 AM', 'Asia/Kuala_Lumpur', 'America/New_York')
// Returns: { displayDate: '2026-05-14', displayTime: '11:00 PM' }
```

**Console Log:**
```
[Display DateTime] Original: 2026-05-15 11:00 AM (Asia/Kuala_Lumpur) → Display: 2026-05-14 11:00 PM (America/New_York)
```

**Usage in Components:**
```typescript
import { formatMeetingForDisplay } from '@/lib/meeting-display';

const display = formatMeetingForDisplay(
  meeting,
  mentee.timezone,  // timezone meeting was created in
  currentUser.timezone // current viewer's timezone
);

if (display) {
  return <div>{display.fullDisplay}</div>; // "2026-05-14 at 11:00 PM"
}
```

### `getMeetingDateTime(dateStr, timeStr, timezone): Date | null`
Converts meeting date/time in user's timezone to UTC Date object.
- Supports both 12-hour (HH:MM AM/PM) and 24-hour (HH:MM) time formats
- Uses date-fns-tz for timezone-aware calculations
- Returns null if parsing fails
- Used internally for all timeline calculations

**Console Log:**
```
[Request Window] Now: 2026-05-01T10:00:00Z, Meeting: 2026-05-15T11:00:00Z, Days until: 14.04
```

### `isWithinRequestWindow(meetingDate, meetingTime, timezone): { allowed, reason? }`
Checks if a meeting request is within the valid window (7-30 days away).
- Returns `{ allowed: true }` if valid
- Returns `{ allowed: false, reason: string }` if outside window
- Rejects if meeting is too soon (<7 days) or too far (>30 days)

**Console Log:**
```
[Request Window] Now: 2026-05-01T10:00:00Z, Meeting: 2026-05-15T11:00:00Z, Days until: 14.04
```

### `canShowFeedbackForm(tokenCycle, timezone, nowUtc): boolean`
Determines if feedback form should be visible to mentee.
- Returns true only if: meeting has passed + 2 hours AND feedback not yet submitted
- Returns false if token_cycle is not "pending" or feedback already submitted
- Timezone-aware calculation

**Console Log:**
```
[Feedback Form Visibility] Meeting: 2026-05-15T11:00:00Z, Unlock: 2026-05-15T13:00:00Z, Now: 2026-05-15T14:00:00Z, Can show: true
```

### `canAcceptFeedbackSubmission(tokenCycle, timezone, nowUtc): { accepted, reason? }`
Validates if feedback submission should be accepted based on timing.
- Returns `{ accepted: true }` if submitted 2+ hours after meeting time
- Returns `{ accepted: false, reason: string }` if too early
- Used by both direct submission endpoint and webhook

**Console Log:**
```
[Feedback Acceptance Check] Meeting: 2026-05-15T11:00:00Z, Unlock: 2026-05-15T13:00:00Z, Submission: 2026-05-15T14:00:00Z
```

### `canReplenishToken(tokenCycle, nowUtc): { canReplenish, reason? }`
Checks if token is eligible for replenishment.
- Requires BOTH:
  1. 1 month since token usage (tokenUsedAt)
  2. Valid feedback submitted (feedbackSubmittedAt exists AND feedbackValid === true)
- Returns detailed reason if not eligible

**Console Log:**
```
[Token Replenishment Check] TokenUsedAt: 2026-04-01T10:00:00Z, Cooldown ends: 2026-05-01T10:00:00Z, Now: 2026-05-02T10:00:00Z, Cooldown passed: true
[Token Replenishment Check] Feedback submitted: true, Feedback valid: true
```

### `getTokenReplenishState(tokenCycle, timezone, nowUtc): { status, message, daysRemaining?, minutesRemaining? }`
Returns UI-friendly state for showing replenishment progress.

**States:**
- `not_pending`: No active token cycle
- `waiting_for_feedback`: Meeting hasn't occurred or 2-hour window not passed
- `waiting_for_cooldown`: Feedback submitted, but <1 month from token usage
- `ready_to_replenish`: All conditions met, token can be replenished now

**Example Response:**
```typescript
{
  status: 'waiting_for_cooldown',
  message: 'Token will replenish in 15 days',
  daysRemaining: 15
}
```

### `replenishTokenIfEligible(menteeDoc, nowUtc): { replenished, reason?, tokensAfter? }`
Performs actual token replenishment if all conditions met.
- Increments tokens by 1 (capped at max 1)
- Sets `token_cycle.status = 'replenished'`
- Sets `token_cycle.evaluatedAt` to current ISO UTC time
- Called by cron job `/api/cron/evaluate-token-cycles`

**Console Log:**
```
[Token Replenishment] Token replenished. Before: 0, After: 1, EvaluatedAt: 2026-05-02T10:00:00Z
```

## API Routes Updated

### `POST /api/meeting-requests/create`
**New Behavior:**
1. Check request window via `isWithinRequestWindow()`
2. Verify mentee has tokens (via `clampToken()`)
3. If valid:
   - Deduct 1 token: `tokens = tokens - 1`
   - Create token_cycle: `buildFreshTokenCycle()`
   - Set `tokenUsedAt` to current ISO UTC time
4. Returns 402 if insufficient tokens, 400 if outside window

**Required Request Fields:**
- `mentorId`, `menteeId`, `menteeName`, `menteeEmail`, `date`, `time`, `message`
- `timezone` (optional, defaults to UTC) - **NEW**

**Response:**
```json
{
  "message": "Meeting request created successfully",
  "meeting": { ... },
  "tokensRemaining": 0
}
```

**Console Logs:**
```
[Meeting Request] Token deducted for mentee {id}. Before: 1, After: 0, TokenUsedAt: 2026-05-01T10:00:00Z
[Request Window] Now: 2026-05-01T10:00:00Z, Meeting: 2026-05-15T11:00:00Z, Days until: 14.04
```

### `POST /api/meetings/submit-feedback`
**New Behavior:**
1. Retrieve meeting from user's schedule
2. If token_cycle exists: use `canAcceptFeedbackSubmission()` for timing validation
3. If token_cycle doesn't exist: fallback to basic 2-hour window check
4. If valid timing:
   - Mark feedback as sent: `feedbackFormSent = true`
   - Update token_cycle: `feedbackValid = true`, `feedbackSubmittedAt = now`
   - Set `feedbackVerificationSource = 'direct-submission'`

**Required Request Fields:**
- `meetingId`, `menteeId`
- `timezone` (optional, defaults to UTC) - **NEW**

**Response Codes:**
- 200: Success
- 400: Too early (< 2 hours after meeting)
- 404: User or meeting not found

**Response:**
```json
{
  "message": "Feedback submitted successfully. Your token will be replenished 1 month after submission.",
  "success": true,
  "feedbackSubmittedAt": "2026-05-15T14:00:00Z"
}
```

**Console Logs:**
```
[Feedback Submission] Feedback submitted for meeting {id}. Marked valid for cycle evaluation at 2026-05-15T14:00:00Z
[Feedback Acceptance Check] Meeting: 2026-05-15T11:00:00Z, Unlock: 2026-05-15T13:00:00Z, Submission: 2026-05-15T14:00:00Z
```

### `POST /api/meetings/feedback-webhook`
**New Behavior:**
1. Verify webhook signature and parse feedback token
2. Find matching mentee and token_cycle
3. Call `canAcceptFeedbackSubmission()` to validate timing
4. If feedback is too early: throw error and reject webhook with 400 status
5. If valid: sync token_cycle with feedback data

**Updated `syncPendingTokenCycle()` function:**
- Now calls `canAcceptFeedbackSubmission()` internally
- Throws error if feedback timing is invalid
- Sets `feedbackVerificationSource = 'google-form-webhook'`

**Response Codes:**
- 200: Success
- 400: Feedback too early or invalid
- 401: Unauthorized (invalid webhook secret)

**Console Logs:**
```
[Feedback Webhook] Feedback not accepted: Feedback is not yet available. Try again in 30 minutes.
[Feedback Webhook] Token cycle updated. Feedback valid, submitted at: 2026-05-15T14:00:00Z
```

### `GET /api/cron/evaluate-token-cycles`
**New Behavior:**
1. Query all users with `token_cycle.status === 'pending'`
2. For each user: call `replenishTokenIfEligible()`
3. If replenished: increment tokens, set status to 'replenished', send email
4. If still waiting: log reason and leave status as pending
5. If ineligible (no feedback/reported): set status to 'forfeited', send email if reported

**Response:**
```json
{
  "success": true,
  "evaluatedCount": 5,
  "replenishedCount": 2,
  "stillPendingCount": 3,
  "timestamp": "2026-05-02T10:00:00Z"
}
```

**Console Logs:**
```
[Token Cycle Evaluation] Starting evaluation at 2026-05-02T10:00:00Z
[Token Cycle Evaluation] Found 5 users with pending token cycles in mentee
[Token Cycle Evaluation] Token replenished for user123 in mentee
[Token Cycle Evaluation] Token cycle still pending (waiting for cooldown): user456, Reason: Cooldown ends in 15 days
[Token Cycle Evaluation] Token cycle forfeited for user789 in mentee
[Token Cycle Evaluation] Evaluation complete. Evaluated: 5, Replenished: 2, Still Pending: 3
```

## Display and Timezone Conversion

### How Times are Stored and Displayed

**In Database:**
- Meeting times are stored as separate `date` (YYYY-MM-DD) and `time` (HH:MM or HH:MM AM/PM) fields
- They represent the time in the timezone of the user who created/scheduled them
- No timezone info is stored with the individual meeting record (timezone comes from the user document)

**Displaying to Other Users:**
- When viewing a meeting created by another user, the time needs to be converted to the viewer's timezone
- The meeting might show on a different date/time depending on timezone differences
- Use `getDisplayMeetingDateTime()` to convert times for display

### Display Utilities

Located in `/src/lib/meeting-display.ts`:

```typescript
/**
 * Format a meeting for display in the user's timezone
 */
formatMeetingForDisplay(meeting, originatorTimezone, viewerTimezone)
// Returns: { displayDate, displayTime, fullDisplay }

/**
 * Format multiple meetings
 */
formatMeetingsForDisplay(meetings, originatorTimezone, viewerTimezone)
// Returns: Array of { original, display }
```

### Example: Multi-Timezone Scenario

**Setup:**
- Mentee A in `Asia/Kuala_Lumpur` schedules meeting for `2026-05-15 11:00 AM`
- Mentor B in `America/New_York` views the meeting request

**Storage (in DB):**
```
meeting.date = "2026-05-15"
meeting.time = "11:00 AM"
```

**What Mentor B sees:**
```typescript
const display = formatMeetingForDisplay(
  meeting,
  menteeA.timezone,     // "Asia/Kuala_Lumpur"
  mentorB.timezone      // "America/New_York"
);
// Returns:
// displayDate: "2026-05-14"
// displayTime: "11:00 PM"
// fullDisplay: "2026-05-14 at 11:00 PM"
```

**Console output during conversion:**
```
[Display DateTime] Original: 2026-05-15 11:00 AM (Asia/Kuala_Lumpur) → Display: 2026-05-14 11:00 PM (America/New_York)
```

### When to Use Each Function

| Function | Use Case |
|----------|----------|
| `getMeetingDateTime()` | Internal calculations (request window, feedback timing, replenishment) |
| `getDisplayMeetingDateTime()` | Convert times for API responses to send to frontend |
| `formatMeetingForDisplay()` | React components displaying meetings to users |
| `formatMeetingsForDisplay()` | React components displaying lists of meetings |

### Important Notes

1. **Always Know the Reference Timezone**: Store or track which timezone a meeting's date/time was recorded in
2. **Day Boundaries Can Cross**: A meeting at 11 PM in one timezone might be next/previous day in another
3. **Preserve Time Format**: 12-hour format stays 12-hour, 24-hour stays 24-hour
4. **Frontend Conversion**: If doing timezone conversion in frontend, use the same `date-fns-tz` utilities for consistency

## Client-Side Hook

### `useFeedbackFormVisibility(props)`
Located in `src/hooks/use-feedback-form-visibility.ts`

**Props:**
- `tokenCycle`: TokenCycle object or null
- `timezone`: IANA timezone string (defaults to 'UTC')

**Returns:**
```typescript
{
  canShow: boolean;              // Is feedback form visible?
  replenishState: {
    status: 'not_pending' | 'waiting_for_feedback' | 'waiting_for_cooldown' | 'ready_to_replenish';
    message: string;             // User-friendly message
    daysRemaining?: number;      // Days until replenishment (if waiting for cooldown)
    minutesRemaining?: number;   // Minutes until form available (if form not yet unlocked)
  };
  message: string;               // Combined message for UI
  isLoading: boolean;
}
```

**Updates:** Every 60 seconds to account for time-based visibility changes.

**Usage Example:**
```typescript
const { canShow, replenishState, message } = useFeedbackFormVisibility({
  tokenCycle: user.token_cycle,
  timezone: user.timezone || 'UTC'
});

if (canShow) {
  return <FeedbackForm />;
}

return <div>{message}</div>;
```

## Data Model

### TokenCycle
```typescript
type TokenCycle = {
  status: 'pending' | 'replenished' | 'forfeited';
  meetingId: string;
  meetingDate: string;           // YYYY-MM-DD
  meetingTime: string;           // HH:MM or HH:MM AM/PM
  tokenUsedAt: string;           // ISO UTC (when request was made)
  feedbackSubmittedAt: string | null;  // ISO UTC (when feedback submitted)
  feedbackValid: boolean;         // Is feedback valid?
  mentorReported: boolean;        // Was meeting reported by mentor?
  reportRecordedAt: string | null;// ISO UTC (when report recorded)
  evaluatedAt: string | null;     // ISO UTC (when cycle was finalized)
};
```

### Mentee/Mentor Document Fields
```typescript
{
  tokens: number;                 // Current token count (0 or 1)
  timezone: string;              // IANA timezone (e.g., 'Asia/Kuala_Lumpur')
  token_cycle?: TokenCycle;      // Current/last token cycle
  scheduling?: Array<{
    meetingId: string;
    date: string;
    time: string;
    decision: 'pending' | 'accepted' | 'rejected';
    scheduled_status: string;
    mentee_email?: string;
    mentor_email?: string;
    feedbackFormSent?: boolean;
    feedbackFormSentAt?: string;
    // ... other fields
  }>;
}
```

## Timeline Example

### Day 1: Request Made (May 1)
```
User makes request for May 15, 11:00 AM
- Request window check: 14 days away ✓ (within 7-30 day window)
- Token deducted: 1 → 0
- token_cycle.status = 'pending'
- token_cycle.tokenUsedAt = 2026-05-01T10:00:00Z
```
**Console:**
```
[Request Window] Now: 2026-05-01T10:00:00Z, Meeting: 2026-05-15T11:00:00Z, Days until: 14.04
[Meeting Request] Token deducted for mentee. Before: 1, After: 0, TokenUsedAt: 2026-05-01T10:00:00Z
```

### Day 14: Meeting Occurs (May 15)
```
Meeting at 11:00 AM
- Feedback form is hidden until 1:00 PM (same day)
```

**At 12:00 PM (too early):**
```
canShowFeedbackForm() returns: false
getTokenReplenishState() returns: {
  status: 'waiting_for_feedback',
  message: 'Feedback form available in 60 minutes',
  minutesRemaining: 60
}
```
**Console:**
```
[Feedback Form Visibility] Meeting: 2026-05-15T11:00:00Z, Unlock: 2026-05-15T13:00:00Z, Now: 2026-05-15T12:00:00Z, Can show: false
```

**At 2:00 PM (valid window):**
```
canShowFeedbackForm() returns: true
Form is now visible
```
**Console:**
```
[Feedback Form Visibility] Meeting: 2026-05-15T11:00:00Z, Unlock: 2026-05-15T13:00:00Z, Now: 2026-05-15T14:00:00Z, Can show: true
```

### Day 14-15: Feedback Submitted (May 15 or 16)
```
User submits feedback form at 2:30 PM on May 15
- canAcceptFeedbackSubmission() check passes ✓
- token_cycle.feedbackSubmittedAt = 2026-05-15T14:30:00Z
- token_cycle.feedbackValid = true
- token_cycle.status still = 'pending'
```
**Console:**
```
[Feedback Submission] Feedback submitted for meeting. Marked valid for cycle evaluation at 2026-05-15T14:30:00Z
```

### Day 45: Cron Evaluation (June 1)
```
Cron job runs evaluate-token-cycles
- 1 month has passed: May 1 + 1 month = June 1 ✓
- feedbackValid = true ✓
- canReplenishToken() returns true
- token_cycle.status = 'replenished'
- tokens: 0 → 1
```
**Console:**
```
[Token Cycle Evaluation] Starting evaluation at 2026-06-01T10:00:00Z
[Token Cycle Evaluation] Token replenished for mentee. Before: 0, After: 1, EvaluatedAt: 2026-06-01T10:00:00Z
```

## Safety Checks

1. **No Duplicate Replenishment**: Check `status === 'pending'` before replenishing
2. **Timezone Awareness**: All meeting times calculated in user's timezone
3. **UTC Timestamps**: All stored timestamps are ISO UTC with Z suffix
4. **Cooldown Math**: Use date-fns `addMonths()` for accurate month addition
5. **Token Clamping**: Max tokens always capped at 1
6. **Feedback Timing**: Validated at both form display and submission
7. **Request Window**: Both too-soon and too-far cases handled
8. **Backwards Compatibility**: Old `parseMeetingDateTime()` function kept for existing code

## Testing Commands

### Test Request Window Validation
```bash
curl -X POST http://localhost:9002/api/meeting-requests/create \
  -H "Content-Type: application/json" \
  -d '{
    "mentorId": "mentor123",
    "menteeId": "mentee456",
    "menteeName": "John",
    "menteeEmail": "john@example.com",
    "date": "2026-05-05",
    "time": "11:00 AM",
    "message": "Request too soon",
    "timezone": "Asia/Kuala_Lumpur"
  }'
# Expected: 400 - Meeting is less than 7 days away
```

### Test Feedback Timing Validation
```bash
# Before 2 hours after meeting
curl -X POST http://localhost:9002/api/meetings/submit-feedback \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "meet_123",
    "menteeId": "mentee456",
    "timezone": "Asia/Kuala_Lumpur"
  }'
# Expected: 400 - Feedback is not yet available
```

### Test Token Replenishment
```bash
curl -X GET "http://localhost:9002/api/cron/evaluate-token-cycles" \
  -H "Authorization: Bearer ${CRON_SECRET}"
# Expected: 200 with replenishment counts
```

## Migration Notes

The implementation is backwards compatible with existing code:
- Old `parseMeetingDateTime()` function still exists and works
- Existing routes continue to work, but won't have new validation until updated
- Timezone support is optional (defaults to UTC)
- Token cycles created before this implementation will work correctly

However, for full functionality, ensure:
1. User documents have `timezone` field set
2. API calls pass `timezone` parameter where applicable
3. Cron job is configured to run `/api/cron/evaluate-token-cycles` regularly
