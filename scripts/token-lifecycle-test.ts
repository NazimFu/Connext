/**
 * Token Lifecycle Integration Tests
 * 
 * This file demonstrates how the token lifecycle functions work together.
 * Run with: node --loader ts-node/esm scripts/token-lifecycle-test.ts
 * Or: npx ts-node scripts/token-lifecycle-test.ts
 */

import {
  getMeetingDateTime,
  isWithinRequestWindow,
  canShowFeedbackForm,
  canAcceptFeedbackSubmission,
  canReplenishToken,
  getTokenReplenishState,
  replenishTokenIfEligible,
  buildFreshTokenCycle,
  clampToken,
} from '../src/lib/token-cycle';

// Test data
const timezone = 'Asia/Kuala_Lumpur';
const menteeId = 'test-mentee-001';

console.log('═'.repeat(80));
console.log('TOKEN LIFECYCLE INTEGRATION TEST');
console.log('═'.repeat(80));

// Scenario: Token request on May 1, 2026
console.log('\n✅ TEST 1: Request Window Validation');
console.log('-'.repeat(80));

const requestDate = '2026-05-15';
const requestTime = '11:00 AM';
const now1 = new Date('2026-05-01T10:00:00Z');

console.log(`Current time: ${now1.toISOString()}`);
console.log(`Meeting scheduled: ${requestDate} at ${requestTime} in ${timezone}`);

const windowCheck = isWithinRequestWindow(requestDate, requestTime, timezone, now1);
console.log(`Request window valid: ${windowCheck.allowed}`);
if (!windowCheck.allowed) {
  console.error(`Reason: ${windowCheck.reason}`);
}

// Create token cycle
const tokenCycle = buildFreshTokenCycle('meet_001', requestDate, requestTime, now1.toISOString());
console.log('\nToken cycle created:');
console.log(JSON.stringify(tokenCycle, null, 2));

// Scenario: Check feedback form visibility
console.log('\n\n✅ TEST 2: Feedback Form Visibility');
console.log('-'.repeat(80));

// Before meeting
const before = new Date('2026-05-15T10:00:00Z');
let visible = canShowFeedbackForm(tokenCycle, timezone, before);
console.log(`\nBefore meeting (${before.toISOString()}): Form visible = ${visible}`);

// 1 hour after meeting (not yet 2 hours)
const oneHourAfter = new Date('2026-05-15T12:00:00Z');
visible = canShowFeedbackForm(tokenCycle, timezone, oneHourAfter);
console.log(`1 hour after meeting (${oneHourAfter.toISOString()}): Form visible = ${visible}`);

// 2+ hours after meeting
const twoHoursAfter = new Date('2026-05-15T13:00:00Z');
visible = canShowFeedbackForm(tokenCycle, timezone, twoHoursAfter);
console.log(`2 hours after meeting (${twoHoursAfter.toISOString()}): Form visible = ${visible}`);

// Scenario: Feedback acceptance timing
console.log('\n\n✅ TEST 3: Feedback Submission Timing Validation');
console.log('-'.repeat(80));

// Try submitting too early
let feedbackCheck = canAcceptFeedbackSubmission(tokenCycle, timezone, oneHourAfter);
console.log(`\nSubmit 1 hour after meeting: ${feedbackCheck.accepted}`);
if (!feedbackCheck.accepted) {
  console.log(`Reason: ${feedbackCheck.reason}`);
}

// Submit at valid time
feedbackCheck = canAcceptFeedbackSubmission(tokenCycle, timezone, twoHoursAfter);
console.log(`\nSubmit 2 hours after meeting: ${feedbackCheck.accepted}`);

// Update token cycle with feedback
tokenCycle.feedbackSubmittedAt = twoHoursAfter.toISOString();
tokenCycle.feedbackValid = true;
console.log('Feedback marked as submitted and valid');

// Scenario: Token replenishment eligibility
console.log('\n\n✅ TEST 4: Token Replenishment Eligibility');
console.log('-'.repeat(80));

// Check 1 day after feedback (cooldown not yet passed)
const oneDay = new Date('2026-05-16T13:00:00Z');
let replenishCheck = canReplenishToken(tokenCycle, oneDay);
console.log(`\n1 day after feedback: Can replenish = ${replenishCheck.canReplenish}`);
if (!replenishCheck.canReplenish) {
  console.log(`Reason: ${replenishCheck.reason}`);
}

// Check 1 month after token usage
const oneMonth = new Date('2026-06-02T10:00:00Z');
replenishCheck = canReplenishToken(tokenCycle, oneMonth);
console.log(`\n1 month + 1 day after token usage: Can replenish = ${replenishCheck.canReplenish}`);
if (replenishCheck.canReplenish) {
  console.log('✓ Token is eligible for replenishment!');
}

// Scenario: Token replenishment state for UI
console.log('\n\n✅ TEST 5: Token Replenishment State (for UI Display)');
console.log('-'.repeat(80));

console.log('\nState while waiting for feedback:');
const stateBefore = getTokenReplenishState(tokenCycle, timezone, oneHourAfter);
console.log(`Status: ${stateBefore.status}`);
console.log(`Message: ${stateBefore.message}`);
console.log(`Minutes remaining: ${stateBefore.minutesRemaining}`);

console.log('\nState while waiting for cooldown:');
const stateWaiting = getTokenReplenishState(tokenCycle, timezone, oneDay);
console.log(`Status: ${stateWaiting.status}`);
console.log(`Message: ${stateWaiting.message}`);
console.log(`Days remaining: ${stateWaiting.daysRemaining}`);

console.log('\nState when ready to replenish:');
const stateReady = getTokenReplenishState(tokenCycle, timezone, oneMonth);
console.log(`Status: ${stateReady.status}`);
console.log(`Message: ${stateReady.message}`);

// Scenario: Actual token replenishment
console.log('\n\n✅ TEST 6: Token Replenishment Execution');
console.log('-'.repeat(80));

const menteeDocBefore = {
  id: menteeId,
  tokens: 0,
  timezone,
  token_cycle: { ...tokenCycle },
};

console.log(`\nMentee tokens before: ${menteeDocBefore.tokens}`);
console.log(`Token cycle status before: ${menteeDocBefore.token_cycle.status}`);

const replenishResult = replenishTokenIfEligible(menteeDocBefore, oneMonth);
console.log(`\nReplenish result: ${replenishResult.replenished}`);
console.log(`Tokens after: ${replenishResult.tokensAfter}`);
console.log(`Token cycle status after: ${menteeDocBefore.token_cycle.status}`);

// Scenario: Safety checks
console.log('\n\n✅ TEST 7: Safety Checks');
console.log('-'.repeat(80));

// Attempt duplicate replenishment
console.log('\nAttempting duplicate replenishment:');
const dupResult = replenishTokenIfEligible(menteeDocBefore, oneMonth);
console.log(`Duplicate replenish result: ${dupResult.replenished}`);
console.log(`Reason: ${dupResult.reason}`);

// Token clamping
console.log('\nToken clamping:');
console.log(`clampToken(0) = ${clampToken(0)}`);
console.log(`clampToken(1) = ${clampToken(1)}`);
console.log(`clampToken(2) = ${clampToken(2)}`);
console.log(`clampToken(-1) = ${clampToken(-1)}`);
console.log(`clampToken(undefined) = ${clampToken(undefined)}`);

// Meeting datetime parsing with timezone
console.log('\nMeeting datetime parsing:');
const meetingDt = getMeetingDateTime(requestDate, requestTime, timezone);
console.log(`Date: ${requestDate}, Time: ${requestTime}, Timezone: ${timezone}`);
console.log(`Parsed UTC: ${meetingDt?.toISOString()}`);

// 24-hour format
const meetingDt24h = getMeetingDateTime('2026-05-15', '14:30', timezone);
console.log(`\nDate: 2026-05-15, Time: 14:30, Timezone: ${timezone}`);
console.log(`Parsed UTC: ${meetingDt24h?.toISOString()}`);

console.log('\n' + '═'.repeat(80));
console.log('✓ ALL TESTS COMPLETED');
console.log('═'.repeat(80));
