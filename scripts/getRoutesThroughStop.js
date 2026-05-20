const fs = require("fs");

// =========================
// LOAD DATA
// =========================
const stopRoutes = JSON.parse(
    fs.readFileSync("./processed/stopRoutes.json", "utf8")
);

// =========================
// GET ROUTES THROUGH STOP
// =========================
function getRoutesThroughStop(stopId) {

    return stopRoutes[stopId] || [];
}

// =========================
// EXPORT
// =========================
module.exports = { getRoutesThroughStop };

// =========================
// CLI TEST
// =========================
if (require.main === module) {

    // example:
    // node getRoutesThroughStop.js KEE306173

    const stopId = process.argv[2];

    const result = getRoutesThroughStop(stopId);

    console.log(JSON.stringify(result, null, 2));
}