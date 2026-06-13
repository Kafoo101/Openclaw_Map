// testNav.js
const { planDoorToDoorRoute } = require("./firstMile");

async function runTestRoute() {
    // 1. Define where the user is standing (Start) and where they want to go (End)
    // (These are sample coordinates near Keelung Station / Harbor area)
    const startLocation = { lat: 25.1505, lon: 121.7754 }; 
    const endLocation   = { lat: 25.1245, lon: 121.7840 }; 
    
    const departureTime = "14:50"; // Leaving at 8 AM
    const maxWalkMinutes = 15;     // Your adjustable walking cap

    try {
        console.log("--- Starting Door-to-Door Routing Test ---");
        
        // 2. Call the completed function
        const finalItinerary = await planDoorToDoorRoute(
            startLocation, 
            endLocation, 
            departureTime, 
            maxWalkMinutes
        );

        // 3. Print the gorgeous, complete journey result
        console.log("\n--- Final Optimized Result ---");
        console.log(JSON.stringify(finalItinerary, null, 2));

    } catch (error) {
        console.error("Navigation failed:", error);
    }
}

runTestRoute();