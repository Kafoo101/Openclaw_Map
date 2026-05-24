const fs = require("fs");

// --------------------
// Ensure output folder
// --------------------
if (!fs.existsSync("./processed")) {
    fs.mkdirSync("./processed");
}

// --------------------
// Load raw data
// --------------------
const stopList = JSON.parse(fs.readFileSync("./Keelung/stopList.json", "utf8"));
const stopRoute = JSON.parse(fs.readFileSync("./Keelung/stopRoute.json", "utf8"));
const shapePoly = JSON.parse(fs.readFileSync("./Keelung/shapePoly.json", "utf8"));
const busList = JSON.parse(fs.readFileSync("./Keelung/busList.json", "utf8"));

// --------------------
// Outputs
// --------------------
const graph = {};
const stopInfo = {};
const routeIndex = {};
const stopRoutes = {};
const shapeIndex = {};
const routeInfo = {};

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const toRad = x => x * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ======================================================
// 1. STOP LAYER
// ======================================================
for (const stop of stopList) {

    const stopUID = stop.StopUID;

    graph[stopUID] = [];

    stopInfo[stopUID] = {
        name_zh: stop.StopName?.Zh_tw || "",
        name_en: stop.StopName?.En || "",
        lat: stop.StopPosition?.PositionLat,
        lng: stop.StopPosition?.PositionLon
    };
}

// ======================================================
// 2. ROUTE META
// ======================================================
for (const bus of busList) {

    const routeUID = bus.RouteUID;
    const routeNameZh = bus.RouteName?.Zh_tw || "";
    const routeNameEn = bus.RouteName?.En || "";

    const subRoutes = bus.SubRoutes || [];

    for (const sub of subRoutes) {

        const subRouteUID = sub.SubRouteUID;

        const routeKey = `${routeUID}_${subRouteUID}`;

        routeInfo[routeKey] = {
            routeUID,
            subRouteUID,
            name_zh: sub.SubRouteName?.Zh_tw || routeNameZh,
            name_en: sub.SubRouteName?.En || routeNameEn,

            headsign_zh: sub.Headsign || "",
            headsign_en: sub.HeadsignEn || "",

            direction: sub.Direction,

            departure_zh: sub.DepartureStopNameZh || "",
            departure_en: sub.DepartureStopNameEn || "",

            destination_zh: sub.DestinationStopNameZh || "",
            destination_en: sub.DestinationStopNameEn || "",

            operatorIds: sub.OperatorIDs || []
        };
    }
}

// ======================================================
// 3. GRAPH BUILD (FIXED SAFE VERSION)
// ======================================================
for (const route of stopRoute) {

    if (!route.Stops || route.Stops.length < 2) continue;

    const routeKey = `${route.RouteUID}_${route.SubRouteUID}_${route.Direction}`;
    const direction = route.Direction;

    routeIndex[routeKey] = [];

    let prevStop = null;

    for (let i = 0; i < route.Stops.length; i++) {

        const stopUID = route.Stops[i].StopUID;

        routeIndex[routeKey].push(stopUID);

        // stop → routes mapping
        if (!stopRoutes[stopUID]) stopRoutes[stopUID] = [];
        if (!stopRoutes[stopUID].includes(routeKey)) {
            stopRoutes[stopUID].push(routeKey);
        }

        // ==================================================
        // EDGE CREATION (SAFE GUARD)
        // ==================================================
        if (prevStop && prevStop !== stopUID) {

            const from = stopInfo[prevStop];
            const to = stopInfo[stopUID];

            let cost = 1; // base hop cost
            if (from && to) {
                cost = haversine(from.lat, from.lng, to.lat, to.lng);
            }

            const neighbors = graph[prevStop];

            const alreadyExists = neighbors.some(e =>
                e.to === stopUID && e.route === routeKey
            );

            if (!alreadyExists) {
                graph[prevStop].push({
                    to: stopUID,
                    route: routeKey,
                    direction: direction,
                    cost: cost
                });
            }
        }

        prevStop = stopUID;
    }
}

// ======================================================
// 4. SHAPE INDEX
// ======================================================
for (const shape of shapePoly) {

    if (!shape.RouteUID || !shape.SubRouteUID) continue;

    const key = `${shape.RouteUID}_${shape.SubRouteUID}_${shape.Direction}`;

    shapeIndex[key] = {
        geometry: shape.Geometry,
        polyline: shape.EncodedPolyline
    };
}

// ======================================================
// 5. SAVE OUTPUT
// ======================================================
fs.writeFileSync("./processed/graph.json", JSON.stringify(graph, null, 2));
fs.writeFileSync("./processed/stopInfo.json", JSON.stringify(stopInfo, null, 2));
fs.writeFileSync("./processed/routeIndex.json", JSON.stringify(routeIndex, null, 2));
fs.writeFileSync("./processed/stopRoutes.json", JSON.stringify(stopRoutes, null, 2));
fs.writeFileSync("./processed/shapeIndex.json", JSON.stringify(shapeIndex, null, 2));
fs.writeFileSync("./processed/routeInfo.json", JSON.stringify(routeInfo, null, 2));

console.log("Graph build complete.");