// ============================================================================
// FILE HEADER & IMPORTS
// ============================================================================
const fs = require("fs");
const path = require("path");

// Import your RAPTOR engine functions
const { findRoute } = require("./raptorEngine");

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================
// Path to the database file containing all city stops with their Lat/Lon coordinates
const STOPS_DATA_PATH = "./processed/stopInfo.json";

// Adjusted walking speed for straight-line estimates (Detour Index Fallback).
// Standard walking is ~80 m/min. We use 55 m/min to simulate urban winding paths, stairs, and roads.
const WALKING_SPEED_METERS_PER_MIN = 55; 

// ============================================================================
// GEOSPATIAL HELPER FUNCTIONS
// ============================================================================

function timeToMinutes(timeString) {
    if (!timeString) return null;
    let [hours, minutes] = timeString.split(":").map(Number);
    if (hours < 4) {
        hours += 24; 
    }
    return (hours * 60) + minutes;
}

function getStraightLineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

function loadAllCityStops() {
    if (!fs.existsSync(STOPS_DATA_PATH)) {
        console.error(`Error: Stops geolocation file missing at ${STOPS_DATA_PATH}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(STOPS_DATA_PATH, "utf8"));
}

// ============================================================================
// CORE SPATIAL FILTERING LOGIC
// ============================================================================

/**
 * Finds all bus stops within a walking radius using Haversine straight-line math.
 * Applies a reduced walking speed constant to estimate real-world urban pathways.
 */
function findNearbyStops(targetGps, allCityStops, maxWalkMinutes = 15) {
    const validStops = {};
    const maxStraightLineDistance = maxWalkMinutes * WALKING_SPEED_METERS_PER_MIN;

    for (const [stopUID, stopData] of Object.entries(allCityStops)) {
        const stopLat = stopData.lat;
        const stopLon = stopData.lng; 

        if (!stopLat || !stopLon) continue;

        const straightDistance = getStraightLineDistance(targetGps.lat, targetGps.lon, stopLat, stopLon);
        
        if (straightDistance <= maxStraightLineDistance) {
            // Directly calculate and assign the safe estimated time
            const estimatedMins = straightDistance / WALKING_SPEED_METERS_PER_MIN;
            validStops[stopUID] = estimatedMins;
        }
    }

    return validStops;
}

// ============================================================================
// MAIN NAVIGATION ORCHESTRATOR (DOOR TO DOOR)
// ============================================================================

async function planDoorToDoorRoute(startGps, endGps, departureTimeStr, maxWalkMinutes = 15) {
    console.log(`Planning route from [${startGps.lat}, ${startGps.lon}] to [${endGps.lat}, ${endGps.lon}] at ${departureTimeStr}...`);
    
    const startTimeInMinutes = timeToMinutes(departureTimeStr);
    const allCityStops = loadAllCityStops();

    // 1. FIRST MILE
    const nearbyOrigins = findNearbyStops(startGps, allCityStops, maxWalkMinutes);
    const walkableOrigins = {};
    for (const [stopUID, walkTime] of Object.entries(nearbyOrigins)) {
        walkableOrigins[stopUID] = startTimeInMinutes + walkTime;
    }

    if (Object.keys(walkableOrigins).length === 0) {
        return { error: "No bus stops found within walking distance of your starting location." };
    }

    // 2. LAST MILE
    const walkableDestinations = findNearbyStops(endGps, allCityStops, maxWalkMinutes);
    const destinationStopUIDs = Object.keys(walkableDestinations);

    if (destinationStopUIDs.length === 0) {
        return { error: "No bus stops found within walking distance of your final destination." };
    }

    // 3. RUN CORE RAPTOR PATTERN
    console.log(`Running RAPTOR with ${Object.keys(walkableOrigins).length} origin stops and ${destinationStopUIDs.length} target stops...`);
    const raptorResult = findRoute(walkableOrigins, destinationStopUIDs);

    if (!raptorResult || raptorResult.length === 0) {
        return { error: "No transit routes found matching your criteria." };
    }

    // 4. FINAL DOOR-TO-DOOR CALCULATIONS
    let absoluteBestJourney = null;
    let earliestDoorArrival = Infinity;
    
    console.log("Door to door starting calculation matrix...");
    for (const journey of raptorResult) {
        const lastStopInJourney = journey.destination; 
        const walkTimeToDoor = walkableDestinations[lastStopInJourney];

        if (walkTimeToDoor !== undefined) {
            const totalJourneyArrival = journey.arrivalTime + walkTimeToDoor;

            if (totalJourneyArrival < earliestDoorArrival) {
                earliestDoorArrival = totalJourneyArrival;
                absoluteBestJourney = {
                    ...journey,
                    firstMileWalkMinutes: parseFloat((nearbyOrigins[journey.origin] || 0).toFixed(2)),
                    lastMileWalkMinutes: parseFloat(walkTimeToDoor.toFixed(2)),
                    finalDoorArrivalTime: parseFloat(totalJourneyArrival.toFixed(2))
                };
            }
        }
    }

    if (!absoluteBestJourney) {
        return { error: "No transit options could successfully connect your walking perimeters." };
    }

    return absoluteBestJourney;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    planDoorToDoorRoute,
    findNearbyStops // Renamed for accuracy since it's no longer hybrid
};