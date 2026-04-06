# Google Form Feedback Integration

## Overview
The system automatically sends feedback forms to mentees 2 hours after their mentorship sessions begin. The form is pre-filled with session details (mentee name, mentor name, date, and time).

## Components

### 1. Google Form Configuration (`src/lib/googleForm.ts`)
- Contains the Google Form URL and entry IDs for pre-filling fields
- `generateFeedbackFormUrl()` function creates pre-filled form URLs

### 2. Email Template (`src/lib/email.ts`)
- Template: `mentee-feedback-form`
- Sends a beautifully formatted email with the form link

### 3. API Endpoint (`src/app/api/meetings/send-feedback/route.ts`)
- **POST** `/api/meetings/send-feedback`
- Checks for sessions that started 2 hours ago (±30 minutes window)
- Sends feedback forms to mentees
- Marks forms as sent in the database to prevent duplicates

## Setup Instructions

### Step 1: Configure Environment Variables
Add to your `.env.local`:
```bash
# Secret key for cron job authentication
CRON_SECRET=your-secure-random-string-here

# Used to sign/verify tracking data embedded in pre-filled form URLs
FEEDBACK_FORM_SIGNING_SECRET=your-long-random-signing-secret

# Secret expected by the Google Apps Script webhook caller
GOOGLE_FORM_WEBHOOK_SECRET=your-google-webhook-secret
```

### Step 2: Set Up Automated Cron Job

#### Option A: Using Vercel Cron Jobs (Recommended for Vercel deployments)
1. Create `vercel.json` in your project root:
```json
{
  "crons": [{
    "path": "/api/meetings/send-feedback",
    "schedule": "0 * * * *"
  }]
}
```
2. Deploy to Vercel - cron jobs will run automatically

#### Option B: Using GitHub Actions
1. Create `.github/workflows/send-feedback.yml`:
```yaml
name: Send Feedback Forms
on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:  # Allow manual trigger

jobs:
  send-feedback:
    runs-on: ubuntu-latest
    steps:
      - name: Call feedback endpoint
        run: |
          curl -X POST https://your-domain.com/api/meetings/send-feedback \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

#### Option C: Using External Cron Service (cron-job.org, EasyCron, etc.)
1. Sign up for a cron service
2. Create a new cron job:
   - **URL**: `https://your-domain.com/api/meetings/send-feedback`
   - **Method**: POST
   - **Schedule**: Every hour (`0 * * * *`)
   - **Headers**: `Authorization: Bearer your-cron-secret`

#### Option D: Using Azure Functions (for Azure deployments)
1. Create a Timer Trigger Azure Function
2. Configure to run every hour
3. Call the endpoint with proper authentication

### Step 3: Testing

#### Manual Testing
```bash
# Test the endpoint manually
curl -X POST http://localhost:3000/api/meetings/send-feedback \
  -H "Authorization: Bearer your-cron-secret"

# Or use the GET endpoint (for development only)
curl http://localhost:3000/api/meetings/send-feedback \
  -H "Authorization: Bearer your-cron-secret"
```

#### Check Response
```json
{
  "success": true,
  "sentCount": 3,
  "sentForms": [
    "meeting-123 (John Doe)",
    "meeting-456 (Jane Smith)"
  ],
  "checkedAt": "2025-12-30T10:00:00.000Z"
}
```

## How It Works

1. **Cron job runs every hour** and calls `/api/meetings/send-feedback`
2. **Endpoint checks** for meetings that started 2 hours ago (±30 min window)
3. **Filters meetings**:
   - Must be accepted (`decision === 'accepted'`)
   - Not cancelled (`scheduled_status !== 'cancelled'`)
   - Feedback form not already sent (`!feedbackFormSent`)
4. **Generates pre-filled form URL** with session details
5. **Sends email** to mentee with the form link
6. **Marks form as sent** in database to prevent duplicates
7. **Processes both** mentor and mentee containers

## Verified Submission Flow (Recommended)

To ensure tokens are only restored after real form submission:

1. **No additional form fields needed** — your current form stays clean.
2. The app embeds an opaque `trackingToken` and signed `signature` in the form URL (hidden from users).
3. Set up a Google Apps Script trigger on form submit to call:
   - `POST /api/meetings/verify-google-form-feedback`
4. The Apps Script extracts the token/signature from the URL and sends them.
5. Endpoint verifies:
   - `GOOGLE_FORM_WEBHOOK_SECRET` header/auth
   - HMAC `signature` generated with `FEEDBACK_FORM_SIGNING_SECRET` over `trackingToken`
6. Only after verification, the app marks:
   - `feedbackFormSent = true`
   - `token_cycle.feedbackValid = true`

Privacy note: Users do not see raw `meetingId` or `menteeId` values — only the public feedback questions.

### Apps Script Example

```javascript
function onFormSubmit(e) {
  // Extract tracking token and signature from the form's referrer URL
  const referrer = e.source.getEditorType ? e.source.getPublishedUrl() : '';
  
  // Safer approach: use Apps Script URL parameters
  const scriptUrl = ScriptApp.getService().getUrl();
  
  // Get the form URL from the response (pre-filled URL that was used to open the form)
  // This is available through the form responder's properties
  let trackingToken = '';
  let signature = '';
  
  try {
    // Try to extract from Session or Cache if stored
    const cache = CacheService.getUserCache();
    trackingToken = cache.get('trackingToken') || '';
    signature = cache.get('signature') || '';
  } catch (err) {
    // If not available, fallback to generating them (for manual testing only)
    console.log('Note: In production, token should come from the form URL');
  }

  const payload = {
    trackingToken: trackingToken,
    signature: signature,
    submittedAt: new Date().toISOString(),
    responseId: e.response ? e.response.getId() : null,
  };

  UrlFetchApp.fetch('https://your-domain.com/api/meetings/verify-google-form-feedback', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-feedback-webhook-secret': 'your-google-webhook-secret',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
```

**How users get the token in the URL:**
1. Mentee receives an email with a pre-filled form link containing `?usp=pp_url&entry.XXX=value&trackingToken=uuid-token&signature=hmac-hash`
2. When they click the link and fill the form, the URL parameters are preserved by Google Forms
3. The Apps Script can read these from the form's browser context or HTTP referrer header

- `feedbackFormDelivered`: boolean (whether feedback email/link was sent)
- `feedbackFormDeliveredAt`: string (ISO timestamp of link delivery)
- `feedbackFormSent`: boolean (whether feedback was actually submitted)
- `feedbackFormSentAt`: string (ISO timestamp of verified submission)
- `feedbackFormVerified`: boolean (submission came through verification webhook)
- `feedbackFormResponseId`: string (Google Form response id when available)

## Viewing Responses
Mentors and admins can view form responses in Google Forms:
1. Go to your Google Form
2. Click "Responses" tab
3. View all submissions with filters for mentor/date/etc.
4. Export to Google Sheets for detailed analysis

## Security Notes
- The endpoint requires authentication via `CRON_SECRET`
- Change the default secret in production
- Consider adding IP whitelist for additional security
- Remove the GET endpoint in production

## Troubleshooting

### Forms not being sent?
1. Check cron job is running: Look at logs/execution history
2. Verify `CRON_SECRET` matches in env and cron config
3. Check email credentials in `.env`
4. Look at API logs for errors

### Duplicate forms sent?
- Ensure cron runs only once per hour
- Check database for `feedbackFormSent` field
- Verify time window calculation (±30 minutes)

### Wrong data in form?
- Check meeting record has correct `mentee_name`, `mentor_name`, `date`, `time`
- Verify Google Form entry IDs in `src/lib/googleForm.ts`
- Test with pre-filled URL manually
