// Load environment variables first
require('dotenv').config({ path: '.env.local' });

const { CosmosClient } = require("@azure/cosmos");

console.log('Environment check:');
console.log('COSMOS_DB_ENDPOINT:', process.env.COSMOS_DB_ENDPOINT);
console.log('COSMOS_DB_DATABASE:', process.env.COSMOS_DB_DATABASE);

// Initialize Cosmos client
const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT,
  key: process.env.COSMOS_DB_KEY,
});

const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE);

async function addTestMeeting() {
  try {
    const mentorContainer = database.container('mentor');
    
    // Get mentor_001
    const querySpec = {
      query: "SELECT * FROM c WHERE c.mentorUID = @mentorId",
      parameters: [
        {
          name: "@mentorId",
          value: "mentor_001"
        }
      ]
    };

    const { resources: mentors } = await mentorContainer.items
      .query(querySpec)
      .fetchAll();

    if (mentors.length === 0) {
      console.log("Mentor not found");
      return;
    }

    const mentor = mentors[0];
    
    // Add a test pending meeting
    const testMeeting = {
      id: "test_" + Date.now(),
      date: "2025-01-20",
      time: "10:00 AM",
      mentee_name: "John Doe",
      mentee_email: "john.doe@example.com",
      decision: "pending",
      duration: "30 minutes",
      topic: "Career guidance and portfolio review"
    };

    // Add to scheduling array
    if (!mentor.scheduling) {
      mentor.scheduling = [];
    }
    mentor.scheduling.push(testMeeting);

    // Update the document
    const { resource: updatedMentor } = await mentorContainer.item(mentor.id, mentor.mentorUID)
      .replace(mentor);

    
    console.log("Test meeting added successfully:", testMeeting);
    
  } catch (error) {
    console.error("Failed to add test meeting:", error);
  }
}

addTestMeeting();