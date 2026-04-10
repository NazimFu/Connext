# Google Form Feedback Integration

## Overview

The app sends a signed Google Form link to the mentee roughly 2 hours after a meeting starts.
When the Google Form is submitted, Apps Script posts the signed token plus the submitted question/answer pairs to `/api/meetings/feedback-webhook`.
The backend then:

1. Verifies the signed token
2. Stores the normalized feedback record on both meeting copies
3. Marks the requester token cycle as feedback-complete
4. Emails the mentor exactly once with the submitted answers

## Required Environment Variables

```bash
CRON_SECRET=replace-with-a-secret-used-by-your-cron
FEEDBACK_TOKEN_SECRET=replace-with-a-long-random-secret
FEEDBACK_WEBHOOK_SECRET=replace-with-a-second-long-random-secret
APP_BASE_URL=https://your-app-domain.com
NEXT_PUBLIC_GOOGLE_FORM_FEEDBACK_TOKEN_ENTRY_ID=entry.1234567890
```

Notes:

- `GOOGLE_FORM_WEBHOOK_SECRET` is still accepted as a rollout fallback, but `FEEDBACK_WEBHOOK_SECRET` is the canonical secret now.
- `NEXT_PUBLIC_GOOGLE_FORM_FEEDBACK_TOKEN_ENTRY_ID` must match the Google Form field used for the signed feedback token.

## Delivery Flow

1. Cron calls `POST /api/meetings/send-feedback` hourly.
2. The endpoint finds accepted meetings that started about 2 hours ago.
3. It skips meetings where `feedbackFormDelivered === true`.
4. It creates one signed Google Form URL per `meetingId`.
5. It emails the mentee once.
6. It writes the same `feedbackFormUrl`, `feedbackToken`, and delivery timestamp to both meeting copies.

Stored meeting flags:

- `feedbackFormDelivered`: feedback link email was sent
- `feedbackFormDeliveredAt`: ISO timestamp when the signed link was delivered
- `feedbackFormSent`: Google Form submission was received
- `feedbackFormSentAt`: ISO timestamp when the submission was accepted
- `feedbackFormVerified`: submission came through the canonical webhook
- `feedbackFormResponseId`: Google response id when Apps Script provides it
- `mentorFeedbackNotifiedAt`: mentor notification email timestamp

## Google Form Setup

Add one new Google Form question:

- Title: `Feedback Token`
- Type: `Short answer`

How to get the entry id:

1. Open the Google Form.
2. Use `Get pre-filled link`.
3. Enter a temporary value for `Feedback Token`.
4. Generate the pre-filled link.
5. Copy the `entry.xxxxxxxx` value for that field into `NEXT_PUBLIC_GOOGLE_FORM_FEEDBACK_TOKEN_ENTRY_ID`.

## Apps Script Setup

Use [google-form-feedback-webhook.gs](/c:/Users/faizc/Desktop/Career/Luminiktyo/Studio_Master/scripts/google-form-feedback-webhook.gs) as the bound Apps Script for the Google Form.

Configure:

- `WEBHOOK_URL` -> `${APP_BASE_URL}/api/meetings/feedback-webhook`
- `WEBHOOK_SECRET` -> `FEEDBACK_WEBHOOK_SECRET`
- `FEEDBACK_TOKEN_QUESTION_TITLE` -> exact title of the Google Form token field

Install an `On form submit` trigger for `onFeedbackFormSubmit`.

## Apps Script Payload

The Apps Script sends:

```json
{
  "feedbackToken": "signed-token",
  "submittedAt": "2026-04-10T12:34:56.000Z",
  "responseId": "google-response-id",
  "responses": [
    { "question": "How was the session?", "answer": "Very helpful" }
  ]
}
```

## Verification Rules

The canonical webhook:

- accepts `FEEDBACK_WEBHOOK_SECRET`
- accepts `GOOGLE_FORM_WEBHOOK_SECRET` during rollout
- rejects missing or invalid signed feedback tokens
- updates requester `token_cycle.feedbackValid = true`
- syncs the normalized feedback record to both the mentor copy and requester copy
- sends the mentor one email containing the submitted answers

## Troubleshooting

### Feedback emails are not sent to mentees

1. Check the cron caller is sending the correct `CRON_SECRET`.
2. Check the meeting is accepted and at least ~2 hours old.
3. Check the meeting does not already have `feedbackFormDelivered = true`.
4. Check `FEEDBACK_TOKEN_SECRET` and `NEXT_PUBLIC_GOOGLE_FORM_FEEDBACK_TOKEN_ENTRY_ID`.

### Feedback is submitted but mentor gets no email

1. Check Apps Script posts to `/api/meetings/feedback-webhook`, not `/api/meetings/verify-google-form-feedback`.
2. Check `FEEDBACK_WEBHOOK_SECRET` or `GOOGLE_FORM_WEBHOOK_SECRET`.
3. Check the mentor meeting copy has `mentor_email`.
4. Check the webhook response for validation or matching errors.

### Duplicate feedback emails

1. Check the cron runs once per hour.
2. Check `feedbackFormDelivered` on both meeting copies.
3. Check `mentorFeedbackNotifiedAt` on the mentor meeting copy.
