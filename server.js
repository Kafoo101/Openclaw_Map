const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
const { planDoorToDoorRoute } = require("./scripts/firstMile")

const app = express();
const PORT = 3000;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    systemInstr = "You are a helpful, slightly witty transit assistant for Keelung, Taiwan. Keep your answers conversational and concise."
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: "No message payload detected." });
        }

        // Fire request to the lightweight Flash engine
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: systemInstr
            }
        });

        // Pull the text string reply from the Gemini envelope
        const replyText = response.text || "I processed your request, but couldn't form words right now.";

        res.json({ reply: replyText });

    } catch (err) {
        console.error("Gemini API Pipeline Crash:", err);
        res.status(500).json({ error: "The AI gateway encountered an error." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});