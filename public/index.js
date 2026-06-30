// Initialize map
const map = L.map('map');

// Global data indices
let raptorIndex;
let shapeIndex;
let stopInfo;
let routeInfo;

// Dedicated layer group to hold all active route drawings (lines, markers, labels)
// This allows us to clear the map instantly when switching modes
const currentRouteLayer = L.featureGroup().addTo(map);

const redIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// --- 1. CORE DATA & UTILITIES ---

async function loadData() {
    [raptorIndex, shapeIndex, stopInfo, routeInfo] = await Promise.all([
        fetch("/processed/raptorIndex.json").then(r => r.json()),
        fetch("/processed/shapeIndex.json").then(r => r.json()),
        fetch("/processed/stopInfo.json").then(r => r.json()),
        fetch("/processed/routeInfo.json").then(r => r.json())
    ]);
}

async function geocode(place) {
    if(place === "USERCURRENTPOS"){
        return getUserLocation();
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1`;
    const res = await fetch(url, { headers: { "User-Agent": "MyMapApp/1.0" } });
    const data = await res.json();

    if (!data || data.length === 0) {
        console.log(`Location not found: ${place}`);
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
    map.setView([result.lat, result.lng], 16);
}

function findClosestVertexIndex(polylinePoints, targetLat, targetLng) {
    let closestIdx = 0;
    let minDistance = Infinity;
    for (let i = 0; i < polylinePoints.length; i++) {
        const dLat = polylinePoints[i][0] - targetLat;
        const dLng = polylinePoints[i][1] - targetLng;
        const dist = dLat * dLat + dLng * dLng;
        if (dist < minDistance) {
            minDistance = dist;
            closestIdx = i;
        }
    }
    return closestIdx;
}

function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            return reject(new Error("Geolocation is not supported by this browser."));
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    displayName: "Your Device Location"
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true, // Forces device to use GPS hardware if available
                timeout: 8000,            // Give up after 8 seconds
                maximumAge: 0             // Force fresh location data, no caching
            }
        );
    });
}

// --- 2. VEHICLE ROUTING ENGINE (OSRM) ---

async function getVehicleOSRMRoute(start, end) {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    return data.routes[0].geometry.coordinates;
}

async function handleVehicleRouting(startCoords, endCoords) {
    // Drop destination marker
    L.marker([endCoords.lat, endCoords.lng], { icon: redIcon })
        .addTo(currentRouteLayer)
        .bindPopup(endCoords.displayName);

    // Fetch and map coordinates
    const coords = await getVehicleOSRMRoute(startCoords, endCoords);
    const latlngs = coords.map(c => [c[1], c[0]]);

    // Draw driving polyline
    L.polyline(latlngs, {
        color: "#2563eb",
        weight: 5,
        opacity: 0.8
    }).addTo(currentRouteLayer);
}


// --- 3. BUS TRANSIT ROUTING ENGINE (RAPTOR) ---

async function fetchBusRoutingAPI(startGps, endGps, departureTimeStr, maxWalkMinutes) {
    const response = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startGps, endGps, departureTimeStr, maxWalkMinutes })
    });
    const result = await response.text();
    return JSON.parse(result);
}

function drawBusLineLeg(leg) {
    const { route, boardedAt, alightedAt } = leg;
    if (!route || !boardedAt || !alightedAt) return;

    const stopSequence = raptorIndex.routeStops[route];
    if (!stopSequence) return;

    const shapeEntry = shapeIndex[route];
    if (!shapeEntry || !shapeEntry.polyline) return;

    const allCoords = polyline.decode(shapeEntry.polyline); 
    const boardStopData = stopInfo[boardedAt];
    const alightStopData = stopInfo[alightedAt];

    let startShapeIdx = 0;
    let endShapeIdx = allCoords.length - 1;
    if (boardStopData) {
        startShapeIdx = findClosestVertexIndex(allCoords, boardStopData.lat, boardStopData.lng);
    }
    if (alightStopData) {
        endShapeIdx = findClosestVertexIndex(allCoords, alightStopData.lat, alightStopData.lng);
    }

    if (startShapeIdx > endShapeIdx) {
        const temp = startShapeIdx;
        startShapeIdx = endShapeIdx;
        endShapeIdx = temp;
    }
    const slicedCoords = allCoords.slice(startShapeIdx, endShapeIdx + 1);

    // Main Bus Route Line
    const busPolyline = L.polyline(slicedCoords, {
        color: '#2563eb', 
        weight: 6,
        opacity: 0.9
    }).addTo(currentRouteLayer);

    const boardName = boardStopData ? boardStopData.name_en : boardedAt;
    const alightName = alightStopData ? alightStopData.name_en : alightedAt;
    busPolyline.bindPopup(`Boarding at: ${boardName}<br>Alight at: ${alightName}`);

    // Station Checkpoint White Circles
    const circleStyle = { color: '#2563eb', fillColor: 'white', fillOpacity: 1, weight: 3, radius: 5 };
    L.circleMarker(slicedCoords[0], circleStyle).addTo(currentRouteLayer);
    L.circleMarker(slicedCoords[slicedCoords.length - 1], circleStyle).addTo(currentRouteLayer);

    // Floating Badge Label
    const baseRouteId = route.substring(0, route.lastIndexOf('_'));
    const routeName = (routeInfo[baseRouteId] && routeInfo[baseRouteId].name_en) ? routeInfo[baseRouteId].name_en : route;
    const midIndex = Math.floor(slicedCoords.length / 2);
    const midCoord = slicedCoords[midIndex];

    const labelIcon = L.divIcon({
        className: '', 
        html: `<div style="background: white; border: 2px solid #2563eb; color: #2563eb; padding: 2px 8px; border-radius: 12px; font-weight: bold; font-family: sans-serif; font-size: 12px; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transform: translate(-50%, -50%); display: inline-block;">${routeName}</div>`,
        iconSize: [0, 0] 
    });

    L.marker(midCoord, { icon: labelIcon }).addTo(currentRouteLayer);
}

async function handleBusRouting(startCoords, endCoords, departureTimeStr, maxWalkMinutes) {
    L.marker([endCoords.lat, endCoords.lng], { icon: redIcon })
        .addTo(currentRouteLayer)
        .bindPopup(`<b>Destination:</b><br>${endCoords.displayName}`);

    // Map geocode format {lat, lng} to RAPTOR engine format {lat, lon}
    const startGps = { lat: startCoords.lat, lon: startCoords.lng };
    const endGps = { lat: endCoords.lat, lon: endCoords.lng };

    const finalItinerary = await fetchBusRoutingAPI(startGps, endGps, departureTimeStr, maxWalkMinutes);
    console.log("Bus Itinerary:", finalItinerary);

    if (finalItinerary && finalItinerary.journey && finalItinerary.journey.length > 0) {
        // walk to first bus station
        let stopUID = finalItinerary.journey[0].boardedAt;
        let stopLat = stopInfo[stopUID].lat;
        let stopLon = stopInfo[stopUID].lng;
        //lanjut coding
        

        for (const leg of finalItinerary.journey) {
            drawBusLineLeg(leg);
        }

        // walk to destination
        stopUID = finalItinerary.journey[finalItinerary.journey.length - 1].alightedAt;
        stopLat = stopInfo[stopUID].lat;
        stopLon = stopInfo[stopUID].lng;
        //lanjut coding
        

    } else {
        console.log("No valid bus routes found for this itinerary.");
    }
}


// --- 4. THE UNIFIED WRAPPER (MULTIPLEXER) ---

async function smartRoute(origin, destination, transportationMode, departureTimeStr, maxWalkMinutes = 12) {
    try {
        console.log(`--- Initiating Smart Route [Mode: ${transportationMode}] ---`);
        
        // 1. Wipe out any previous routes, labels, and markers
        currentRouteLayer.clearLayers();

        // 2. Geocode natural language text to structured coordinates
        const startCoords = await geocode(origin);
        const endCoords = await geocode(destination);

        if (!startCoords || !endCoords) {
            alert("Could not map one or both locations. Please try another name.");
            return;
        }

        // 3. Branching execution path based on mode selection
        if (transportationMode === 'vehicle') {
            await handleVehicleRouting(startCoords, endCoords);
        } else if (transportationMode === 'bus') {
            await handleBusRouting(startCoords, endCoords, departureTimeStr, maxWalkMinutes);
        } else {
            console.error(`Unknown transportation mode: ${transportationMode}`);
            return;
        }

        // 4. Dynamic Camera Fitting: Bound perfectly around whatever shapes were generated
        const activeLayers = currentRouteLayer.getLayers();
        if (activeLayers.length > 0) {
            map.fitBounds(currentRouteLayer.getBounds(), { padding: [30, 30] });
        }

    } catch (error) {
        console.error("Smart routing failed to complete execution:", error);
    }
}


// --- 5. INITIALIZATION & UI ---

// OpenStreetMap basic tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

function setupChatUI() {
    const messages = document.getElementById('messages');
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    function appendMessage(kind, text) {
        const el = document.createElement('div');
        el.className = 'message ' + (kind === 'user' ? 'user' : 'bot');
        el.textContent = text;
        messages.appendChild(el);
        messages.scrollTop = messages.scrollHeight;
    }

    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        // 1. Render the user's message instantly on-screen
        appendMessage('user', text);
        input.value = '';
        input.focus();

        try {
            // 2. Fire the payload over to your local server router
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            const data = await response.json();

            // 3. Render the text reply directly from Gemini
            if (data.reply) {
                appendMessage('bot', data.reply);
            } else if (data.error) {
                appendMessage('bot', `System Error: ${data.error}`);
            } else {
                appendMessage('bot', "I connected to the server, but got an empty response.");
            }

        } catch (error) {
            console.error("Chat Pipeline Error:", error);
            appendMessage('bot', "Couldn't reach the server. Is the backend running?");
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

async function init() {
    await loadData();
    setupChatUI();

    // Setup initial camera viewpoint anchor
    await goToPlace("National Taiwan Ocean University");
    
    // --- TESTING THE MULTIPLEXER ---
    // Switch between 'private vehicle' and 'bus transit' to see it dynamically clear and rewrite!
    await smartRoute(
        "Keelung Railway Station", 
        "USERCURRENTPOS", 
        "bus", 
        "14:50", 
        20
    );
}

document.addEventListener('DOMContentLoaded', init);