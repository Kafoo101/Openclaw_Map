// testNav.js
const fs = require("fs");
const { planDoorToDoorRoute } = require("./firstMile");
stopInfo = JSON.parse(fs.readFileSync("./processed/stopInfo.json", "utf8"));
routeInfo = JSON.parse(fs.readFileSync("./processed/routeInfo.json", "utf8"));

function formatRoutingOutput(rawResultJsonStr) {
    let data;
    try {
        data = JSON.parse(rawResultJsonStr);
    } catch (e) {
        console.error("Invalid JSON string provided to formatter:", e);
        return null;
    }

    // --- Helper: Convert decimal minutes (e.g., 0.99) to "X min Y sec"
    const formatWalkTime = (decimalMinutes) => {
        if (typeof decimalMinutes !== 'number') return "0 min 0 sec";
        const mins = Math.floor(decimalMinutes);
        const secs = Math.round((decimalMinutes - mins) * 60);
        return `${mins} min ${secs} sec`;
    };

    // --- Helper: Convert minutes from midnight (e.g., 1177.24) to "HH:MM"
    const formatClockTime = (totalMinutes) => {
        if (typeof totalMinutes !== 'number') return "00:00";
        const floorMins = Math.floor(totalMinutes);
        const h = String(Math.floor(floorMins / 60) % 24).padStart(2, '0');
        const m = String(floorMins % 60).padStart(2, '0');
        return `${h}:${m}`;
    };

    // --- Helper: Fetch English Stop Name (fallback to UID if missing)
    const getStopName = (uid) => {
        return stopInfo[uid] ? stopInfo[uid].name_en : uid;
    };

    // --- Helper: Fetch English Route Name (strips direction flag to match dictionary)
    const getRouteName = (routeKey) => {
        // "KEE0356_KEE035601_0" -> "KEE0356_KEE035601"
        const baseRouteId = routeKey.substring(0, routeKey.lastIndexOf('_'));
        return routeInfo[baseRouteId] ? routeInfo[baseRouteId].name_en : routeKey;
    };

    // --- Build the final UI-ready object
    return {
        origin: getStopName(data.origin),
        destination: getStopName(data.destination),
        arrivalTime: formatClockTime(data.arrivalTime),
        
        journey: data.journey.map(step => ({
            route: getRouteName(step.route),
            tripId: step.tripId,
            boardedAt: getStopName(step.boardedAt),
            boardTime: step.boardTime, // Kept as-is, already formatted by your RAPTOR engine
            alightedAt: getStopName(step.alightedAt),
            arrivalTime: step.arrivalTime // Kept as-is, already formatted by your RAPTOR engine
        })),

        firstMileWalk: formatWalkTime(data.firstMileWalkMinutes),
        lastMileWalk: formatWalkTime(data.lastMileWalkMinutes),
        finalDoorArrivalTime: formatClockTime(data.finalDoorArrivalTime)
    };
}

async function runTestRoute() {
    // 1. Define where the user is standing (Start) and where they want to go (End)
    // (These are sample coordinates near Keelung Station / Harbor area)
    const startLocation = { lat: 25.1505, lon: 121.7754 }; 
    const endLocation   = { lat: 25.1352, lon: 121.7462 }; 
    
    const departureTime = "20:03"; // Leaving time
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
        const result = formatRoutingOutput(JSON.stringify(finalItinerary, null, 2));
        console.log(result);
        

    } catch (error) {
        console.error("Navigation failed:", error);
    }
}

runTestRoute();