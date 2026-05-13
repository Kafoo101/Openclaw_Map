async function geocode(place) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1`;

    const res = await fetch(url, {
        headers: {
            "User-Agent": "MyMapApp/1.0"
        }
    });
    const data = await res.json();

    if (!data || data.length === 0) {
        console.log("No results found");
        return null;
    }

    return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name
    };
}

async function goToPlace(place) {
    const result = await geocode(place);
    if (!result) return;
    map.setView([result.lat, result.lng], 16)
}

async function getRoute(start, end) {
    const url = `https://router.project-osrm.org/route/v1/driving/` +
        `${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

    const res = await fetch(url);
    const data = await res.json();

    return data.routes[0].geometry.coordinates;
}

async function drawLine(origin, destination, originMark = false, destinationMark = true) {
    var start = await geocode(origin);
    var end = await geocode(destination);

    if (!start || !end) {
        console.log("Location not found");
        return;
    }

    start = {
        lat: parseFloat(start.lat),
        lng: parseFloat(start.lng)
    };

    end = {
        lat: parseFloat(end.lat),
        lng: parseFloat(end.lng),
        displayName: end.displayName
    };

    if(originMark) L.marker([start.lat, start.lng]).addTo(map);
    if(destinationMark) L.marker([end.lat, end.lng]).addTo(map).bindPopup(end.displayName).openPopup();

    const coords = await getRoute(start, end);
    const latlngs = coords.map(c => [c[1], c[0]]);
    const routeLine = L.polyline(latlngs, {
        color: "blue",
        weight: 5
    }).addTo(map);
    map.fitBounds(routeLine.getBounds());
}

async function route() {
    const origin = document.getElementById("origin").value;
    const destination = document.getElementById("destination").value;

    if (!origin || !destination) {
        alert("Please enter both origin and destination");
        return;
    }

    drawLine(origin, destination);
}

// initialize map
const map = L.map('map');

// OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Initial Location
goToPlace("National Taiwan Ocean University");
//drawLine("National Taiwan Ocean University", "Evergreen Laurel Hotel Keelung");
