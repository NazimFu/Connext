# Google Form Feedback Webhook Setup

## Required Environment Variables

```bash
FEEDBACK_TOKEN_SECRET=replace-with-a-long-random-secret
FEEDBACK_WEBHOOK_SECRET=replace-with-a-different-long-random-secret
APP_BASE_URL=https://your-app-domain.com
NEXT_PUBLIC_GOOGLE_FORM_FEEDBACK_TOKEN_ENTRY_ID=entry.1234567890
```

Notes:

- `NEXT_PUBLIC_GOOGLE_FORM_FEEDBACK_TOKEN_ENTRY_ID` must match the Google Form field used for the signed feedback token.
- `GOOGLE_FORM_WEBHOOK_SECRET` is still accepted during rollout, but `FEEDBACK_WEBHOOK_SECRET` is the canonical secret.

## Google Form Changes

Add one question to the Google Form:

- Question title: `Feedback Token`
- Type: `Short answer`

This field is prefilled by the app and submitted back to Apps Script.

To get the Google Form entry id:

1. Open the Google Form.
2. Click the three-dot menu.
3. Choose `Get pre-filled link`.
4. Type a temporary value into the `Feedback Token` question.
5. Submit the prefill generator.
6. Copy the `entry.xxxxxxxx` value into `NEXT_PUBLIC_GOOGLE_FORM_FEEDBACK_TOKEN_ENTRY_ID`.

## Apps Script Setup

Use [google-form-feedback-webhook.gs](/c:/Users/faizc/Desktop/Career/Luminiktyo/Studio_Master/scripts/google-form-feedback-webhook.gs) as the bound Google Apps Script for the form.

Update these constants:

- `WEBHOOK_URL` -> `${APP_BASE_URL}/api/meetings/feedback-webhook`
- `WEBHOOK_SECRET` -> `FEEDBACK_WEBHOOK_SECRET`
- `FEEDBACK_TOKEN_QUESTION_TITLE` -> exact Google Form title for the token field

Then install an Apps Script trigger:

1. Open the Google Form.
2. Open `Extensions -> Apps Script`.
3. Paste in the script file content.
4. Save the project.
5. Open `Triggers`.
6. Add a trigger:
   - function: `onFeedbackFormSubmit`
   - event source: `From form`
   - event type: `On form submit`

## Expected Flow

1. The app generates a signed Google Form URL during the valid feedback window.
2. The mentee opens the form and presses `Submit`.
3. Apps Script posts the submission to `/api/meetings/feedback-webhook`.
4. The backend verifies the signed token, stores the normalized feedback on both meeting copies, and emails the mentor exactly once.
