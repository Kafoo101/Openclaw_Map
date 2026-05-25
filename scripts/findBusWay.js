const fs = require("fs");

// =========================
// LOAD DATA
// =========================
const graph = JSON.parse(fs.readFileSync("./processed/graph.json", "utf8"));
const stopInfo = JSON.parse(fs.readFileSync("./processed/stopInfo.json", "utf8"));
const routeInfo = JSON.parse(fs.readFileSync("./processed/routeInfo.json", "utf8"));
const SPEED = 5; // m/s (~40 km/h bus average)

// =========================
// HEURISTIC (Haversine distance)
// =========================
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
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

function heuristic(a, b) {
    const A = stopInfo[a];
    const B = stopInfo[b];

    if (!A || !B) return 0;

    return haversine(A.lat, A.lng, B.lat, B.lng) / SPEED;
}

function toReadable(routePath) {

    return routePath.map(step => {

        const stop = stopInfo[step.node];
        const routeKey = step.route? step.route.substring(0, step.route.lastIndexOf("_")) : null;
        const route = routeKey ? routeInfo[routeKey] : null;

        return {
            stop: stop?.name_en || step.node,
            route: route?.name_en || step.route
        };
    });
}

// =========================
// A* SEARCH
// =========================
function findBusWayAStar(start, end) {

    const openSet = [{
        node: start,
        route: null,
        cost: 0,
        routePath: [{ node: start, route: null }]
    }];

    const bestCost = new Map();

    while (openSet.length > 0) {

        // sort by f = g + h
        openSet.sort((a, b) => {
            const fa = a.cost + heuristic(a.node, end);
            const fb = b.cost + heuristic(b.node, end);
            return fa - fb;
        });

        const current = openSet.shift();

        const { node, route, cost, routePath } = current;

        if (node === end) {
            return {
                routePath,
                cost
            };
        }

        const stateKey = node + "|" + route;

        if (bestCost.has(stateKey) && bestCost.get(stateKey) <= cost) {
            continue;
        }

        bestCost.set(stateKey, cost);

        const neighbors = graph[node] || [];

        for (const edge of neighbors) {

            const nextNode = edge.to;
            const nextRoute = edge.route;

            const isTransfer = route !== null && route !== nextRoute;
            
            const distance = edge.cost ?? 1;
            const travelTime = distance / SPEED;
            const transferPenalty = isTransfer ? 360 : 0;
            const stepCost = travelTime + transferPenalty;

            const newCost = cost + stepCost;
            openSet.push({
                node: nextNode,
                route: nextRoute,
                cost: newCost,
                routePath: [...routePath, { node: nextNode, route: nextRoute }]
            });
        }
    }

    return null;
}

// =========================
// CLI
// =========================
if (require.main === module) {

    const start = process.argv[2];
    const end = process.argv[3];

    const result = findBusWayAStar(start, end);

    const readable = {
        cost: result.cost,
        route: toReadable(result.routePath)
    };

    console.log(JSON.stringify(readable, null, 2));
}

module.exports = { findBusWayAStar, toReadable };