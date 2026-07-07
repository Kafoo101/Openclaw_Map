const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
const { planDoorToDoorRoute } = require("./scripts/firstMile")

const app = express();
const PORT = 3000;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

//Better GPS string handling
/*
function parseGps(gpsString) {
    if (gpsString === "USERCURRENTPOS") return null; // Handle this in your engine or logic
    const [lat, lon] = gpsString.split(",").map(Number);
    return { lat, lon };
}*/

//Tools definitions
const smartRouteTool = {
    name: "planTransitRoute",
    description: "Calculates transit lines and maps paths between locations. Use this when a user asks for directions or routing help.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            origin: { 
                type: "string", 
                description: "The starting location, e.g., 'Keelung Railway Station' or 'USERCURRENTPOS'." 
            },
            destination: { 
                type: "string", 
                description: "The destination location, e.g., 'National Taiwan Ocean University'." 
            },
            transportationMode: { 
                type: "string", 
                enum: ["bus", "vehicle"],
                description: "The mode of transport, either 'bus' or 'vehicle'." 
            },
            departureTimeStr: { 
                type: "string", 
                description: "The departure time in 'HH:MM' format, e.g., '14:50', or 'NOW' for immediate departure. Defaults to 'NOW' if not provided." 
            },
            maxWalkMinutes: { 
                type: "number", 
                description: "Maximum walk allowance in minutes. Defaults to 12 if not provided." 
            },
            delay: {
                type: "number",
                description: "Optional delay in minutes to simulate a later departure time. Defaults to 0 if not provided."
            }
        },
        required: ["origin", "destination", "transportationMode", "departureTimeStr"]
    }
};

// serve frontend files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/processed', express.static(path.join(__dirname, 'processed')));

app.post("/api/route", async (req, res) => {
    try {
        const { startGps, endGps, departureTimeStr, maxWalkMinutes } = req.body;
        const result = await planDoorToDoorRoute(startGps, endGps, departureTimeStr, maxWalkMinutes);

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: err.message
        });
    }
});

app.post("/api/chat", async (req, res) => {
    try {
        const { message, timestamp } = req.body;
        console.log("Incoming Chat Message:", message);
        console.log("Current Time:", timestamp);

        if (!message) {
            return res.status(400).json({ error: "No message payload detected." });
        }

        // Fire request containing both personality instruction and tool capabilities
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: message,
            config: {
                // The Strategic Instruction
                systemInstruction: `
                You are a helpful transit assistant for Keelung, Taiwan. 
                Keep your range of search on the map in Taiwan only. 
                Whenever a user asks for directions, routing help, or how to get somewhere, you MUST execute the planTransitRoute tool. 
                Do not try to write text coordinates manually. 
                While calling planTransitRoute tool, you MUST obey the rules as in description. 
                For example, if the user did not give you their origin, fill in 'USERCURRENTPOS' as the origin. 
                If the user did not give you a departure time, fill in 'NOW'. 
                If the user did not give you a max walk allowance, fill in 12 minutes. 
                If the user did not give you a transportation mode, fill in 'bus'.
                If the user asks for a delay, you MUST include the 'delay' parameter with a value in minutes.
                `,
                
                // Registering the Tool Blueprint
                tools: [{ functionDeclarations: [smartRouteTool] }]
            }
        });

        
        // GATEKEEPER LOGIC: Detect if the model chose to invoke a tool call
        if (response.functionCalls && response.functionCalls.length > 0) {
            const call = response.functionCalls ? response.functionCalls[0] : null;
            console.log("Tool Call Event Detected!", call);

            //Execution Logic
            if (call.name === "planTransitRoute") {

                //console.log("DEBUG: Raw Args received from Gemini:", call.args);

                let departureTime = null;
                if (call.args.departureTimeStr === "NOW") {
                    departureTime = timestamp; // Use the current timestamp if "NOW" is specified
                }
                //console.log("DEBUG: Adjusted Departure Time:", departureTime);

                const result = {
                    origin: call.args.origin,
                    destination: call.args.destination,
                    transportationMode: call.args.transportationMode,
                    departureTimeStr: departureTime,
                    maxWalkMinutes: call.args.maxWalkMinutes || 12,
                    delay: call.args.delay || 0
                };

                //console.log("DEBUG: Routing result:", result);

                return res.json({ actionType: "ROUTE_DATA", data: result }); // to index.js
            }

        }

        // CASE B: Normal Conversational Text Chat
        console.log("💬 Normal Chat Event Detected.");
        const replyText = response.text || "I'm with you, but couldn't form words right now.";
        
        return res.json({ 
            actionType: "TEXT_REPLY", 
            reply: replyText 
        });

    } catch (err) {
        console.error("Gemini API Pipeline Crash:", err);
        return res.status(500).json({ error: "The AI gateway encountered an error." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});