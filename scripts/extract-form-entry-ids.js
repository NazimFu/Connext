/**
 * Extract Google Form entry IDs from a prefill URL
 * Usage: node extract-form-entry-ids.js "https://docs.google.com/forms/d/e/XXX/viewform?usp=pp_url&entry.123=value&entry.456=value"
 */

const url = process.argv[2];

if (!url) {
  console.error('❌ Please provide a Google Form prefill URL as an argument');
  console.log('\nUsage:');
  console.log('  node scripts/extract-form-entry-ids.js "<prefill-url>"');
  console.log('\nExample:');
  console.log('  node scripts/extract-form-entry-ids.js "https://docs.google.com/forms/d/e/1FAIpQLSdVEs.../viewform?usp=pp_url&entry.123=test&entry.456=value"');
  process.exit(1);
}

try {
  const urlObj = new URL(url);
  const params = urlObj.searchParams;
  const entries = {};

  params.forEach((value, key) => {
    if (key.startsWith('entry.')) {
      entries[key] = value;
    }
  });

  if (Object.keys(entries).length === 0) {
    console.error('❌ No entry IDs found in the URL');
    console.log('\nMake sure the URL contains entry.XXXXX parameters');
    process.exit(1);
  }

  console.log('\n✅ Found entry IDs:\n');
  Object.entries(entries).forEach(([entryId, value]) => {
    console.log(`  ${entryId} = "${value}"`);
  });

  console.log('\n📋 Copy-pasteable entry IDs:\n');
  Object.keys(entries).forEach(entryId => {
    console.log(`  ${entryId}`);
  });
} catch (error) {
  console.error('❌ Invalid URL:', error.message);
  process.exit(1);
}
