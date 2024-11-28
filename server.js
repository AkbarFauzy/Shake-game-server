const express = require("express");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Store active sessions
const sessions = {};

// WebSocket Server for real-time communication
const wss = new WebSocket.Server({noServer: true }, ()=>{
    console.log("Server Start")
});

// Send ping to connected clients every second
setInterval(() => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            // Send ping message to client (TV or mobile)
            client.send(JSON.stringify({ type: 'ping' }));
        }
    });
}, 1000);

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const sessionId = urlParams.get('sessionId');
    const device = urlParams.get('device');

    if (device === 'tv') {
        // Store TV WebSocket connection with sessionId
        sessions[sessionId] = { tv: ws, phone: null };
    } else if (device === 'phone') {
        // When mobile connects, associate the phone with the sessionId
        if (sessions[sessionId]) {
            sessions[sessionId].phone = ws;
            console.log(`Mobile connected to session: ${sessionId}`);
        } else {
            ws.close(); // Session doesn't exist
            console.log(`Session ${sessionId} not found`);
        }
    }

    // Handle messages between TV and mobile
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        console.log(`Message from ${device}:`, data);

        // Relay shake message to TV if it's from the phone
        if (device === 'phone' && data.action === 'shake') {
            const tvWebSocket = sessions[sessionId] ? sessions[sessionId].tv : null;
            if (tvWebSocket) {
                tvWebSocket.send(JSON.stringify({ action: 'shake', device: 'phone' }));
                console.log(`Relay shake event to TV: ${sessionId}`);
            }
        }
    });

    ws.on('close', () => {
        // Clean up session when a device disconnects
        for (const [key, session] of Object.entries(sessions)) {
            if (session.tv === ws || session.phone === ws) {
                delete sessions[key];
                console.log(`Session ${key} closed`);
            }
        }
    });
});

// Monitor all connected clients
setInterval(() => {
    const currentTime = Date.now();

    // Check each client for activity
    Object.keys(sessions).forEach(sessionId => {
        const client = sessions[sessionId];

        // If client hasn't responded to the last ping in 5 seconds, disconnect it
        if (currentTime - client.lastPing > 5000) {
            console.log(`Client ${client.device} (sessionId: ${sessionId}) has timed out`);
            client.ws.terminate(); // Disconnect client
            delete sessions[sessionId]; // Remove from sessions
        }
    });
}, 1000);

// Allow CORS for WebSocket connections
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // Allow any origin
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    next();
});


// Upgrade HTTP to WebSocket
const server = app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
});

server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
    });
});