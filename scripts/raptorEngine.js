const fs = require("fs");

// ==========================================
// 1. GLOBAL MEMORY (State)
// ==========================================
// These hold the pre-indexed data in RAM for instant O(1) lookups.
let routeStops = {}; 
let routeTrips = {}; 
let stopRoutes = {}; 
let engineReady = false;

const MAX_TRANSFERS = 3;

// ==========================================
// 2. INITIALIZATION (Runs once on startup)
// ==========================================
function initEngine() {
    const indexPath = "./processed/raptorIndex.json";
    
    if (!fs.existsSync(indexPath)) {
        console.error(`[Fatal] RAPTOR index not found at ${indexPath}. Run Phase 1 first.`);
        return false;
    }

    console.log("Loading RAPTOR index into memory...");
    const masterIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    
    routeStops = masterIndex.routeStops;
    routeTrips = masterIndex.routeTrips;
    stopRoutes = masterIndex.stopRoutes;
    engineReady = true;

    console.log("RAPTOR Engine Online. Ready for queries.");
    return true;
}

// ==========================================
// 3. CORE ALGORITHM (The Math)
// ==========================================
/**
 * @param {Object} walkableOrigins - e.g., { "StopA": 480, "StopB": 485 } (StopUID -> minutes past midnight)
 * @param {string} destinationStops - e.g., "StopZ"
 */
function runRAPTOR(walkableOrigins, destinationStops) {
    const targetDestinations = Array.isArray(destinationStops) ? new Set(destinationStops) : new Set([destinationStops]);
    
    const earliestArrival = Array.from({ length: MAX_TRANSFERS + 1 }, () => new Map());
    const journeyState = Array.from({ length: MAX_TRANSFERS + 1 }, () => new Map());
    
    const bestArrival = new Map();
    const bestEffort = new Map(); // NEW: Tracks the effort (walk time) to break ties

    // Load Round 0 (Walk to starting stops)
    let markedStops = new Set();
    for (const [stopUID, time] of Object.entries(walkableOrigins)) {
        earliestArrival[0].set(stopUID, time);
        bestArrival.set(stopUID, time);
        bestEffort.set(stopUID, time); // Initial effort is the starting walk time
        markedStops.add(stopUID);
    }

    for (let k = 1; k <= MAX_TRANSFERS; k++) {
        
        for (const [stop, time] of earliestArrival[k - 1].entries()) {
            earliestArrival[k].set(stop, time);
        }

        const Q = new Map(); 

        for (const stop of markedStops) {
            const routesPassingThrough = stopRoutes[stop] || [];
            
            for (const routeKey of routesPassingThrough) {
                const stopsOnRoute = routeStops[routeKey];
                const stopIndex = stopsOnRoute.indexOf(stop);

                if (!Q.has(routeKey) || stopIndex < Q.get(routeKey).index) {
                    Q.set(routeKey, { index: stopIndex, stopUID: stop });
                }
            }
        }

        markedStops.clear(); 

        for (const [routeKey, boardPoint] of Q.entries()) {
            
            let activeTrip = null;
            let boardStop = null;
            let boardTime = null; 
            let boardEffort = null; // NEW: Tracks the effort used to catch this specific bus
            
            const stopsOnRoute = routeStops[routeKey];
            const tripsOnRoute = routeTrips[routeKey];

            for (let i = boardPoint.index; i < stopsOnRoute.length; i++) {
                const currentStop = stopsOnRoute[i];
                
                // Step A: ALIGHTING TIE-BREAKER
                if (activeTrip !== null) {
                    const arrivalAtStop = activeTrip.schedule[i].arr;
                    const currentBestTime = bestArrival.get(currentStop) ?? Infinity;
                    const currentBestEffort = bestEffort.get(currentStop) ?? Infinity;

                    // Update if it's faster OR if it's a tie but required less walk effort
                    const isFaster = arrivalAtStop < currentBestTime;
                    const isTieButLessEffort = (arrivalAtStop === currentBestTime) && (boardEffort < currentBestEffort);

                    if (isFaster || isTieButLessEffort) {
                        earliestArrival[k].set(currentStop, arrivalAtStop);
                        bestArrival.set(currentStop, arrivalAtStop);
                        bestEffort.set(currentStop, boardEffort); // Save the effort that won the tie
                        markedStops.add(currentStop);
                        
                        journeyState[k].set(currentStop, {
                            route: routeKey,
                            tripId: activeTrip.tripId,
                            boardedAt: boardStop,
                            boardTime: boardTime, 
                            alightedAt: currentStop,
                            time: arrivalAtStop
                        });
                    }
                }

                // Step B: BOARDING TIE-BREAKER
                if (earliestArrival[k - 1].has(currentStop)) {
                    const myArrivalTime = earliestArrival[k - 1].get(currentStop);
                    
                    for (const trip of tripsOnRoute) {
                        const tripDeparture = trip.schedule[i].dep;
                        
                        if (tripDeparture >= myArrivalTime) {
                            const currentTripIndex = tripsOnRoute.indexOf(trip);
                            const activeTripIndex = activeTrip ? tripsOnRoute.indexOf(activeTrip) : Infinity;
                            
                            let shouldBoard = currentTripIndex < activeTripIndex;
                            
                            // NEW: If it's the exact same bus trip, but we reached this stop with less walking effort, 
                            // overwrite the boarding location!
                            if (currentTripIndex === activeTripIndex && myArrivalTime < boardEffort) {
                                shouldBoard = true;
                            }
                            
                            if (shouldBoard) {
                                activeTrip = trip;
                                boardStop = currentStop;
                                boardTime = tripDeparture; 
                                boardEffort = myArrivalTime; // Update running effort
                            }
                            break; 
                        }
                    }
                }
            }
        }

        if (markedStops.size === 0) break;
    }

    // (Keep the existing CHOOSE THE BEST SURVIVING DESTINATION block exactly the same)
    const validJourneys = [];

    for (const destStop of targetDestinations) {
        const absoluteBestTime = bestArrival.get(destStop);
        
        if (absoluteBestTime !== undefined && absoluteBestTime !== Infinity) {
            const pathSequence = buildPathSequence(destStop, earliestArrival, journeyState);
            
            validJourneys.push({
                origin: pathSequence.length > 0 ? pathSequence[0].boardedAt : null,
                destination: destStop,
                arrivalTime: absoluteBestTime,
                journey: pathSequence
            });
        }
    }

    return validJourneys.sort((a, b) => a.arrivalTime - b.arrivalTime);
}

// ==========================================
// PATH RECONSTRUCTION (Deterministic Loop-Free)
// ==========================================
function buildPathSequence(destinationStop, earliestArrival, journeyState) {
    // 1. Determine which round yielded the absolute fastest arrival time at destination
    let bestK = -1;
    let minTime = Infinity;

    for (let k = 1; k <= MAX_TRANSFERS; k++) {
        if (earliestArrival[k] && earliestArrival[k].has(destinationStop)) {
            const time = earliestArrival[k].get(destinationStop);
            if (time < minTime) {
                minTime = time;
                bestK = k;
            }
        }
    }

    // Destination was never reached
    if (bestK === -1) return [];

    const path = [];
    let currentStop = destinationStop;
    let currentK = bestK;

    // 2. Trace backward through the timeline layers
    while (currentK > 0 && journeyState[currentK].has(currentStop)) {
        const step = journeyState[currentK].get(currentStop);
        
        path.unshift({
            route: step.route,
            tripId: step.tripId,
            boardedAt: step.boardedAt,
            boardTime: minutesToTime(step.boardTime), // <-- NEW: Formatted beautifully for the UI
            alightedAt: step.alightedAt,
            arrivalTime: minutesToTime(step.time)
        });
        
        // Jump backward to the stop where we caught this bus
        currentStop = step.boardedAt;
        
        // Drop down to the previous round layer to find out how we got to that boarding stop
        currentK--;
    }

    return path;
}

// Helper: Converts 330 -> "05:30"
function minutesToTime(minutes) {
    if (minutes === null || minutes === undefined) return null;
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

// ==========================================
// 5. PUBLIC API (The Wrapper)
// ==========================================
function findRoute(walkableOrigins, destinationStop) {
    if (!engineReady) {
        const success = initEngine();
        if (!success) return { error: "Engine failed to initialize." };
    }
    
    return runRAPTOR(walkableOrigins, destinationStop);
}

// Export for use in your main server/API file
module.exports = { initEngine, findRoute };

// ==========================================
// CLI TESTER
// ==========================================
if (require.main === module) {
    initEngine();
    
    const testOrigins = {
        "KEE306429": 480,  
        "KEE306430": 485   
    };
    const testDestination = "KEE309534";
    
    const result = findRoute(testOrigins, testDestination);
    console.log(JSON.stringify(result, null, 2));
}