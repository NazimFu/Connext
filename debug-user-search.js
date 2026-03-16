require('dotenv').config({ path: '.env.local' });

const { CosmosClient } = require("@azure/cosmos");

const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT,
  key: process.env.COSMOS_DB_KEY,
});

const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE);

async function debugUserSearch() {
  try {
    console.log('=== Debugging User Search for "Tiffany Brown" ===');
    console.log('Environment check:');
    console.log('COSMOS_DB_ENDPOINT:', process.env.COSMOS_DB_ENDPOINT ? 'Set' : 'Not set');
    console.log('COSMOS_DB_DATABASE:', process.env.COSMOS_DB_DATABASE);
    console.log('');

    // Check mentee container
    console.log('1. Checking MENTEE container:');
    const menteeContainer = database.container('mentee');
    
    // First, let's see all mentees to understand the data structure
    const allMentees = await menteeContainer.items.query('SELECT * FROM c').fetchAll();
    console.log(`   Found ${allMentees.resources.length} mentee(s)`);
    
    allMentees.resources.forEach((mentee, index) => {
      console.log(`   Mentee ${index + 1}:`, {
        id: mentee.id,
        mentee_name: mentee.mentee_name,
        name: mentee.name,
        mentee_email: mentee.mentee_email,
        email: mentee.email
      });
    });

    // Search for Tiffany Brown in mentee
    const menteeQuery = {
      query: "SELECT * FROM c WHERE c.mentee_name = @name",
      parameters: [{ name: "@name", value: "Tiffany Brown" }]
    };
    const menteeResults = await menteeContainer.items.query(menteeQuery).fetchAll();
    console.log(`   Mentee search results for "Tiffany Brown": ${menteeResults.resources.length} found`);

    console.log('');

    // Check mentor container
    console.log('2. Checking MENTOR container:');
    const mentorContainer = database.container('mentor');
    
    // First, let's see all mentors to understand the data structure
    const allMentors = await mentorContainer.items.query('SELECT * FROM c').fetchAll();
    console.log(`   Found ${allMentors.resources.length} mentor(s)`);
    
    allMentors.resources.forEach((mentor, index) => {
      console.log(`   Mentor ${index + 1}:`, {
        id: mentor.id,
        mentor_name: mentor.mentor_name,
        name: mentor.name,
        mentor_email: mentor.mentor_email,
        email: mentor.email
      });
    });

    // Search for Tiffany Brown in mentor
    const mentorQuery = {
      query: "SELECT * FROM c WHERE c.mentor_name = @name",
      parameters: [{ name: "@name", value: "Tiffany Brown" }]
    };
    const mentorResults = await mentorContainer.items.query(mentorQuery).fetchAll();
    console.log(`   Mentor search results for "Tiffany Brown": ${mentorResults.resources.length} found`);

    console.log('');
    
    // Test case-insensitive search
    console.log('3. Testing case-insensitive searches:');
    const variations = ['tiffany brown', 'TIFFANY BROWN', 'Tiffany brown', 'tiffany Brown'];
    
    for (const variation of variations) {
      const testQuery = {
        query: "SELECT * FROM c WHERE LOWER(c.mentee_name) = LOWER(@name)",
        parameters: [{ name: "@name", value: variation }]
      };
      const testResults = await menteeContainer.items.query(testQuery).fetchAll();
      console.log(`   Mentee search for "${variation}": ${testResults.resources.length} found`);
    }

    console.log('');
    console.log('=== Debug Complete ===');

  } catch (error) {
    console.error('Error during debug:', error);
  }
}

debugUserSearch();
