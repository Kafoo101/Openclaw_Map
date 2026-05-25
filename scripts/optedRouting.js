const fs = require("fs");
// Import the A* search function from your findBusWay file
const { findBusWayAStar, toReadable } = require("./findBusWay");

// ==========================================
// LOAD DATA
// ==========================================
const stopInfo = JSON.parse(fs.readFileSync("./processed/stopInfo.json", "utf8"));

// ==========================================
// DISTANCE & COST HELPERS
// ==========================================
/**
 * Haversine formula to compute distance in meters between two lat/lng pairs
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Calculates walking time in seconds based on standard walking speed
 */
function calculateWalkingSeconds(lat1, lng1, lat2, lng2) {
    const distanceMeters = haversineDistance(lat1, lng1, lat2, lng2);
    const WALKING_SPEED = 1.25; // 1.25 m/s (~4.5 km/h)
    return distanceMeters / WALKING_SPEED;
}

// ==========================================
// FIND 5 NEAREST STOPS FROM RAW LAT/LNG
// ==========================================
/**
 * Scans stopInfo to find the 5 physically closest bus stops to a given coordinate
 */
function findNearestStopsFromLatLng(lat, lng, limit = 5) {
    const candidates = [];
    
    for (const [id, info] of Object.entries(stopInfo)) {
        const distance = haversineDistance(lat, lng, info.lat, info.lng);
        candidates.push({
            id: id,
            name: info.name_en || info.name_zh || id,
            lat: info.lat,
            lng: info.lng,
            distance: distance
        });
    }

    // Sort by proximity and slice top results
    return candidates
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
}

// ==========================================
// CORE OPTIMIZATION LAYER
// ==========================================
function optedRouting(startLat, startLng, endLat, endLng) {
    try {
        // 1. Get the 5 nearest stops for both the starting position and the destination
        const originStops = findNearestStopsFromLatLng(startLat, startLng, 3);
        const destStops = findNearestStopsFromLatLng(endLat, endLng, 3);

        if (originStops.length === 0 || destStops.length === 0) {
            return { error: "No stops found in stopInfo database." };
        }

        let bestRoute = null;
        let lowestTotalCost = Infinity;

        // 2. Brute-force through the 5x5 combination matrix
        for (const startStop of originStops) {
            // Calculate walking duration from starting coordinates to this stop (seconds)
            const walkToStartCost = calculateWalkingSeconds(startLat, startLng, startStop.lat, startStop.lng);

            for (const endStop of destStops) {
                // Calculate walking duration from this stop to destination coordinates (seconds)
                const walkToEndCost = calculateWalkingSeconds(endStop.lat, endStop.lng, endLat, endLng);

                // Run your A* router between the two candidate stop IDs
                const transitResult = findBusWayAStar(startStop.id, endStop.id);

                if (!transitResult || transitResult.cost === undefined) {
                    continue; // Skip if no bus path connects these two stops
                }

                // 3. Aggregate full multi-modal cost (Walking + Transit execution cost)
                const totalCost = walkToStartCost + transitResult.cost + walkToEndCost;

                if (totalCost < lowestTotalCost) {
                    lowestTotalCost = totalCost;
                    
                    bestRoute = {
                        totalJourneyTimeSeconds: Math.round(totalCost),
                        breakdown: {
                            walkToBoardingStopSeconds: Math.round(walkToStartCost),
                            busTransitSeconds: Math.round(transitResult.cost),
                            walkToDestinationSeconds: Math.round(walkToEndCost)
                        },
                        instructions: {
                            walkToStop: {
                                id: startStop.id,
                                name: startStop.name,
                                lat: startStop.lat,
                                lng: startStop.lng
                            },
                            getOffAtStop: {
                                id: endStop.id,
                                name: endStop.name,
                                lat: endStop.lat,
                                lng: endStop.lng
                            }
                        },
                        fullTransitPath: toReadable(transitResult.routePath)
                    };
                }
            }
        }

        return bestRoute;

    } catch (err) {
        return { error: err.message };
    }
}

// ==========================================
// CLI EXECUTION ENVIRONMENT
// ==========================================
if (require.main === module) {
    const startLat = parseFloat(process.argv[2]);
    const startLng = parseFloat(process.argv[3]);
    const endLat = parseFloat(process.argv[4]);
    const endLng = parseFloat(process.argv[5]);

    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
        console.log("Usage: node optedRouting.js <startLat> <startLng> <endLat> <endLng>");
        console.log("Example: node optedRouting.js 25.1505 121.7725 25.1312 121.7401");
        process.exit(1);
    }

    const result = optedRouting(startLat, startLng, endLat, endLng);

    if (!result) {
        console.log(JSON.stringify({ message: "No viable transit combinations discovered for these coordinates." }, null, 2));
    } else {
        console.log(JSON.stringify(result, null, 2));
    }
}

module.exports = { optedRouting };