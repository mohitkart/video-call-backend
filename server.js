const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'video-call-backend'
  });
});

// Get server stats
app.get('/api/stats', (req, res) => {
  const stats = wsServer ? wsServer.getStats() : { error: 'WebSocket server not initialized' };
  res.json(stats);
});

// Get all active rooms
app.get('/api/rooms', (req, res) => {
  // This would require exposing roomManager from WebSocketServer
  res.json({ message: 'Use WebSocket connection for room operations' });
});

// Validate room exists (public endpoint)
app.get('/api/rooms/:roomId/validate', (req, res) => {
  const { roomId } = req.params;
  // We can't easily access roomManager from here in this structure
  // For simplicity, we'll accept all room IDs and validate in WebSocket
  res.json({ valid: true, roomId });
});

const PORT = process.env.PORT || 5000;

// Initialize WebSocket server
const WebSocketServer = require('./websocket');
const wsServer = new WebSocketServer(server);

server.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`🌐 WebSocket server ready at ws://localhost:${PORT}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

module.exports = { app, server };