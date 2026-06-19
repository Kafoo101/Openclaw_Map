const express = require('express');
const { planDoorToDoorRoute } = require("./scripts/firstMile")
const path = require('path');

const app = express();
const PORT = 3000;

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

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});