const fs = require("fs");

// =========================
// LOAD DATA
// =========================
const graph = JSON.parse(fs.readFileSync("./processed/graph.json", "utf8"));
const stopRoutes = JSON.parse(fs.readFileSync("./processed/stopRoutes.json", "utf8"));

// =========================
// DIJKSTRA ROUTE SEARCH
// =========================
function findRoute(start, end) {

    const pq = [{
        node: start,
        path: [start],
        route: null,
        stops: 0
    }];

    const visited = new Map();

    while (pq.length) {

        // sort by lowest cost (priority queue simulation)
        pq.sort((a, b) => a.stops - b.stops);
        const current = pq.shift();

        const { node, path, route, stops } = current;

        // reached destination
        if (node === end) {
            return {
                //type: "dijkstra",
                path,
                stops
            };
        }

        const key = node + "|" + route;

        if (visited.has(key) && visited.get(key) <= stops) {
            continue;
        }

        visited.set(key, stops);

        const neighbors = graph[node] || [];

        for (const edge of neighbors) {

            const nextNode = edge.to;
            const nextRoute = edge.route;

            const isTransfer = route !== null && route !== nextRoute;

            const newStops =
                stops +
                1 +                    // 1 per stop
                (isTransfer ? 10 : 0); // transfer penalty

            pq.push({
                node: nextNode,
                path: [...path, nextNode],
                route: nextRoute,
                stops: newStops
            });
        }
    }

    return null;
}

// =========================
// EXPORT / CLI
// =========================
module.exports = { findRoute };

if (require.main === module) {

    const start = process.argv[2];
    const end = process.argv[3];

    const result = findRoute(start, end);

    console.log(JSON.stringify(result, null, 2));
}