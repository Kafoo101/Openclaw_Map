// initialize map
const map = L.map('map');
let currentRoute = null;
let endMarker = null;

async function busRouting(startGps, endGps, departureTimeStr, maxWalkMinutes) {
    const response = await fetch("/api/route", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ startGps, endGps, departureTimeStr, maxWalkMinutes })
    });

    const result = await response.json();
    return result;
}

async function runTestRoute() {
    // 1. Define where the user is standing (Start) and where they want to go (End)
    // (These are sample coordinates)
    const startLocation = { lat: 25.1505, lon: 121.7754 }; 
    const endLocation   = { lat: 25.1245, lon: 121.7840 }; 
    
    const departureTime = "14:50"; // Leaving time
    const maxWalkMinutes = 15;     // Your adjustable walking cap

    try {
        console.log("--- Starting Door-to-Door Routing Test ---");
        
        // 2. Call the completed function
        const finalItinerary = await busRouting(startLocation, endLocation, departureTime, maxWalkMinutes);

        // 3. Print the gorgeous, complete journey result
        console.log("\n--- Final Optimized Result ---");
        console.log(finalItinerary);
        // ubah bagian sini

        

    } catch (error) {
        console.error("Navigation failed:", error);
    }
}

// OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const redIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",

    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

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
    let start = await geocode(origin);
    let end = await geocode(destination);

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
    if(destinationMark) {
        if(endMarker) map.removeLayer(endMarker);
        endMarker = L.marker([end.lat, end.lng], {icon: redIcon}).addTo(map).bindPopup(end.displayName);
    } 

    const coords = await getRoute(start, end);
    const latlngs = coords.map(c => [c[1], c[0]]);
    if (currentRoute) map.removeLayer(currentRoute);
    currentRoute = L.polyline(latlngs, {
        color: "blue",
        weight: 5
    }).addTo(map);
    map.fitBounds(currentRoute.getBounds());
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

// Initial Location
goToPlace("National Taiwan Ocean University");
runTestRoute();
//drawLine("National Taiwan Ocean University", "Evergreen Laurel Hotel Keelung");
