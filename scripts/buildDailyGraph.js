const fs = require("fs");

// ==========================================
// CONFIGURATION
// ==========================================
const INPUT_FILE = "./processed/dailySchedule.json"; 
const OUTPUT_FILE = "./processed/raptorIndex.json";

if (!fs.existsSync("./processed")) {
    fs.mkdirSync("./processed");
}

function timeToMinutes(timeString) {
    if (!timeString) return null;
    
    let [hours, minutes] = timeString.split(":").map(Number);
    
    if (hours < 2) {
        hours += 24;
    }
    
    return (hours * 60) + minutes;
}

function buildAndSaveMemoryIndex() {
    console.log("Starting unified daily RAPTOR index build...");

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Error: Raw TDX file missing at ${INPUT_FILE}`);
        process.exit(1);
    }

    const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

    const routeStops = {}; 
    const routeTrips = {}; 
    const stopRoutes = {}; 

    for (const route of rawData) {
        
        if (!route.Timetables || route.Timetables.length === 0) continue;

        const routeKey = `${route.RouteUID}_${route.SubRouteUID}_${route.Direction}`;
        routeTrips[routeKey] = [];

        for (const trip of route.Timetables) {
            
            if (!trip.StopTimes || trip.StopTimes.length === 0) continue;

            const sortedStops = trip.StopTimes.sort((a, b) => a.StopSequence - b.StopSequence);

            const schedule = [];
            for (const stop of sortedStops) {
                const stopUID = stop.StopUID;
                schedule.push({
                    seq: stop.StopSequence,
                    stop: stopUID,
                    arr: timeToMinutes(stop.ArrivalTime), 
                    dep: timeToMinutes(stop.DepartureTime)
                });

                if (!stopRoutes[stopUID]) stopRoutes[stopUID] = [];
                if (!stopRoutes[stopUID].includes(routeKey)) {
                    stopRoutes[stopUID].push(routeKey);
                }
            }

            routeTrips[routeKey].push({
                tripId: trip.TripID,
                schedule: schedule
            });

            if (!routeStops[routeKey]) {
                routeStops[routeKey] = schedule.map(s => s.stop);
            }
        }
    }

    const masterIndex = {
        routeStops,
        routeTrips,
        stopRoutes
    };

    // --- THE FIX IS HERE ---
    // Added 'null, 2' for human-readable indentation
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(masterIndex, null, 2));
    
    console.log(`Successfully parsed raw TDX and generated RAPTOR index at: ${OUTPUT_FILE}`);
}

buildAndSaveMemoryIndex();