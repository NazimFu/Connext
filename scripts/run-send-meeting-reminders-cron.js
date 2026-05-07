/**
 * Local cron runner for `/api/cron/send-meeting-reminders`
 * Usage: node scripts/run-send-meeting-reminders-cron.js
 * Reads API_URL and CRON_SECRET from .env
 */

require('dotenv').config();
const https = require('https');
const http = require('http');

const config = {
  apiUrl: process.env.API_URL || 'http://localhost:9002',
  cronSecret: process.env.CRON_SECRET || 'feedback-cron-secret-xyz789abc',
  intervalMs: Number(process.env.LOCAL_CRON_INTERVAL_MS) || 60 * 1000, // default 1 minute
};

const candidateApiUrls = Array.from(new Set([
  config.apiUrl,
  'http://localhost:9002',
  'http://localhost:3000',
]));

function requestReminders(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    console.log(`[${new Date().toISOString()}] Calling reminders endpoint: ${url}`);

    const options = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.cronSecret}`,
        'Content-Type': 'application/json',
      },
    };

    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          console.log(`[${new Date().toISOString()}] Response from ${url}:`, parsed);
          resolve({ ok: true, statusCode: res.statusCode, body: parsed });
        } catch (e) {
          console.log(`[${new Date().toISOString()}] Response (raw) from ${url}:`, data);
          resolve({ ok: true, statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] Request error for ${url}:`, err.message);
      reject(err);
    });

    req.end();
  });
}

async function callReminders() {
  for (const apiUrl of candidateApiUrls) {
    const url = `${apiUrl}/api/cron/send-meeting-reminders`;
    try {
      const result = await requestReminders(url);
      if (result.ok) {
        return;
      }
    } catch (err) {
      // Try the next candidate URL.
    }
  }

  console.error(`[${new Date().toISOString()}] All reminder endpoint candidates failed:`, candidateApiUrls);
}

console.log('🚀 Local reminders cron started');
console.log(`📍 API: ${config.apiUrl}`);
console.log(`⏱ Interval (ms): ${config.intervalMs}`);

// Run immediately, then every interval
callReminders();
setInterval(callReminders, config.intervalMs);
