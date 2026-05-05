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

function callReminders() {
  const url = `${config.apiUrl}/api/cron/send-meeting-reminders`;
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
        console.log(`[${new Date().toISOString()}] Response:`, parsed);
      } catch (e) {
        console.log(`[${new Date().toISOString()}] Response (raw):`, data);
      }
    });
  });

  req.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Request error:`, err.message);
  });

  req.end();
}

console.log('🚀 Local reminders cron started');
console.log(`📍 API: ${config.apiUrl}`);
console.log(`⏱ Interval (ms): ${config.intervalMs}`);

// Run immediately, then every interval
callReminders();
setInterval(callReminders, config.intervalMs);
