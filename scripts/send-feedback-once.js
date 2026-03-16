/**
 * One-time script to manually send feedback forms
 * Useful for testing or manual triggers
 */

require('dotenv').config();
const https = require('https');
const http = require('http');

// Configuration
const apiUrl = process.env.API_URL || 'http://localhost:9002';
const cronSecret = process.env.CRON_SECRET || 'your-cron-secret-here';

function sendFeedbackForms() {
  const url = `${apiUrl}/api/meetings/send-feedback`;
  const protocol = url.startsWith('https') ? https : http;
  
  console.log('Sending feedback forms...');
  console.log('URL:', url);
  console.log('---');
  
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cronSecret}`,
      'Content-Type': 'application/json'
    }
  };

  const req = protocol.request(url, options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('\nResponse:');
      console.log('Status:', res.statusCode);
      console.log('Body:', data);
      
      try {
        const result = JSON.parse(data);
        if (result.success) {
          console.log('\n✅ Success!');
          console.log(`Sent ${result.sentCount} feedback form(s)`);
          if (result.sentForms && result.sentForms.length > 0) {
            console.log('\nSent to:');
            result.sentForms.forEach(form => console.log(`  - ${form}`));
          }
        } else {
          console.log('\n❌ Failed:', result.error);
        }
      } catch (error) {
        console.error('\n❌ Error parsing response');
      }
    });
  });

  req.on('error', (error) => {
    console.error('\n❌ Error:', error.message);
  });

  req.end();
}

sendFeedbackForms();
