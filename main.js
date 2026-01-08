const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND || "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.get('/', (req, res) => {
  res.send('Socket Server Running!');
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (roomName) => {
    console.log(`${socket.id} joined room: ${roomName}`);
    
    // ✅ FIXED: Proper way to get room clients
    socket.join(roomName);
    
    const roomClients = io.sockets.adapter.rooms.get(roomName);
    const clients = roomClients ? Array.from(roomClients) : [];
    
    console.log(`Room ${roomName} has ${clients.length} clients`);
    
    if (clients.length === 1) {  // First user
      socket.emit('created');
    } else if (clients.length === 2) {  // Second user
      socket.emit('joined');
      socket.to(roomName).emit('ready');
    } else {
      socket.emit('full');
    }
  });

  socket.on('offer', (offer, roomName) => {
    socket.to(roomName).emit('offer', offer);
  });

  socket.on('answer', (answer, roomName) => {
    socket.to(roomName).emit('answer', answer);
  });

  socket.on('icecandidate', (candidate, roomName) => {
    socket.to(roomName).emit('icecandidate', candidate);
  });

  socket.on('leave', (roomName) => {
    socket.to(roomName).emit('user-left');
    socket.leave(roomName);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 5000;
httpServer.listen(PORT, () => {
  console.log(`Socket Server running on http://localhost:${PORT}`);
});
