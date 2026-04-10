/**
 * Install this as an Apps Script bound to the Google Form and attach an
 * installable "On form submit" trigger to `onFeedbackFormSubmit`.
 *
 * Script Properties keys:
 * - WEBHOOK_URL (required): full API URL, e.g. https://your-domain.com/api/meetings/feedback-webhook
 * - WEBHOOK_SECRET (required): FEEDBACK_WEBHOOK_SECRET value from your app
 * - FEEDBACK_TOKEN_QUESTION_TITLE (optional): defaults to "Feedback Token"
 */

const DEFAULT_FEEDBACK_TOKEN_QUESTION_TITLE = 'Feedback Token';

function getConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = String(properties.getProperty('WEBHOOK_URL') || '').trim();
  const webhookSecret = String(properties.getProperty('WEBHOOK_SECRET') || '').trim();
  const feedbackTokenQuestionTitle =
    String(properties.getProperty('FEEDBACK_TOKEN_QUESTION_TITLE') || DEFAULT_FEEDBACK_TOKEN_QUESTION_TITLE).trim();

  if (!webhookUrl) {
    throw new Error('WEBHOOK_URL is missing in Script Properties');
  }

  if (!webhookSecret) {
    throw new Error('WEBHOOK_SECRET is missing in Script Properties');
  }

  return {
    webhookUrl,
    webhookSecret,
    feedbackTokenQuestionTitle,
  };
}

function testConfig() {
  const cfg = getConfig_();
  Logger.log('WEBHOOK_URL: ' + cfg.webhookUrl);
  Logger.log('WEBHOOK_SECRET: ' + (cfg.webhookSecret ? 'FOUND' : 'MISSING'));
  Logger.log('FEEDBACK_TOKEN_QUESTION_TITLE: ' + cfg.feedbackTokenQuestionTitle);
}

function onFeedbackFormSubmit(e) {
  if (!e || !e.response) {
    throw new Error('Missing form submit event response');
  }

  const cfg = getConfig_();

  const itemResponses = e.response.getItemResponses();
  let feedbackToken = '';
  const responses = [];

  itemResponses.forEach((itemResponse) => {
    const question = itemResponse.getItem().getTitle();
    const answer = normalizeResponseValue_(itemResponse.getResponse());

    if (question === cfg.feedbackTokenQuestionTitle) {
      feedbackToken = answer;
      return;
    }

    responses.push({
      question: question,
      answer: answer,
    });
  });

  if (!feedbackToken) {
    throw new Error('Signed feedback token was not submitted with the form');
  }

  const payload = {
    feedbackToken: feedbackToken,
    submittedAt: new Date().toISOString(),
    responseId: e.response.getId(),
    responses: responses,
  };

  const response = UrlFetchApp.fetch(cfg.webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-feedback-webhook-secret': cfg.webhookSecret,
    },
    payload: JSON.stringify(payload),
  });

  const responseCode = response.getResponseCode();
  if (responseCode >= 300) {
    throw new Error(`Feedback webhook failed (${responseCode}): ${response.getContentText()}`);
  }
}

// Optional compatibility alias if your trigger currently points to `onFormSubmit`.
function onFormSubmit(e) {
  return onFeedbackFormSubmit(e);
}

function normalizeResponseValue_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return String(value);
}
