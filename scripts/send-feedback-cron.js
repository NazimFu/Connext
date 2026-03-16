/**
 * Simple cron job script to send feedback forms every hour
 * This runs independently and calls your API endpoint
 */

require('dotenv').config();
const https = require('https');
const http = require('http');

// Configuration
const config = {
  // Your API URL (change to your actual domain when deployed)
  apiUrl: process.env.API_URL || 'http://localhost:9002',
  // Your CRON_SECRET from .env
  cronSecret: process.env.CRON_SECRET || 'your-cron-secret-here',
  // Run every hour (in milliseconds)
  intervalMs: 60 * 60 * 1000 // 1 hour
};

function sendFeedbackForms() {
  const url = `${config.apiUrl}/api/meetings/send-feedback`;
  const protocol = url.startsWith('https') ? https : http;
  
  console.log(`[${new Date().toISOString()}] Calling feedback endpoint...`);
  
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.cronSecret}`,
      'Content-Type': 'application/json'
    }
  };

  const req = protocol.request(url, options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log(`[${new Date().toISOString()}] Response:`, result);
        
        if (result.sentCount > 0) {
          console.log(`✅ Sent ${result.sentCount} feedback forms`);
        } else {
          console.log('ℹ️  No feedback forms to send at this time');
        }
      } catch (error) {
        console.error('Error parsing response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Error:`, error.message);
  });

  req.end();
}

// Run immediately on start
console.log('🚀 Feedback form cron job started');
console.log(`📍 API URL: ${config.apiUrl}`);
console.log(`⏰ Running every ${config.intervalMs / 60000} minutes`);
console.log('---');

sendFeedbackForms();

// Then run every hour
setInterval(sendFeedbackForms, config.intervalMs);
