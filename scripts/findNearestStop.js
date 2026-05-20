const fs = require("fs");

// =========================
// LOAD STOP INFO
// =========================
const stopInfo = JSON.parse(
    fs.readFileSync("./processed/stopInfo.json", "utf8")
);

// =========================
// HAVERSINE DISTANCE
// =========================
function haversine(lat1, lng1, lat2, lng2) {

    const R = 6371000; // meters

    const toRad = (deg) => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// =========================
// FIND NEAREST STOP
// =========================
function findNearestStop(lat, lng) {

    let bestStop = null;
    let bestDistance = Infinity;

    for (const stopUID in stopInfo) {

        const stop = stopInfo[stopUID];

        if (
            stop.lat === undefined ||
            stop.lng === undefined
        ) continue;

        const distance = haversine(
            lat,
            lng,
            stop.lat,
            stop.lng
        );

        if (distance < bestDistance) {

            bestDistance = distance;

            bestStop = {
                stopUID,
                name_zh: stop.name_zh,
                name_en: stop.name_en,
                lat: stop.lat,
                lng: stop.lng,
                distance
            };
        }
    }

    return bestStop;
}

// =========================
// EXPORT
// =========================
module.exports = { findNearestStop };

// =========================
// CLI TEST
// =========================
if (require.main === module) {

    // example:
    // node findNearestStop.js 25.1502 121.7721

    const lat = parseFloat(process.argv[2]);
    const lng = parseFloat(process.argv[3]);

    const result = findNearestStop(lat, lng);

    console.log(JSON.stringify(result, null, 2));
}