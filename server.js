const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();

/** 🔑 IMPORTANT: Express CORS (optional but safe) */
const cors = require("cors");
app.use(
  cors({
    origin: process.env.FRONTEND || "*",
    methods: ["GET", "POST"],
    credentials: true
  })
);


const server = http.createServer(app);

/** 🔑 Socket.IO CORS (THIS FIXES IT) */
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND || "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;
// Store connected users
// users = { userId: [socketIds] }
const users = {};

// Serve a simple route
app.get("/", (req, res) => {
  res.send("Socket.IO server is running ✅");
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", socket.id);
  });

  socket.on("offer", (data) => {
    socket.to(data.to).emit("offer", {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on("answer", (data) => {
    socket.to(data.to).emit("answer", {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on("ice-candidate", (data) => {
    socket.to(data.to).emit("ice-candidate", {
      candidate: data.candidate,
      from: socket.id
    });
  });


  // Temporary variable to store which user this socket belongs to
  let currentUserId = null;

  // Register user with a userId
  socket.on("register", (p) => {
    const userId=p.id
    currentUserId = userId;
    // Allow multiple connections per user
    if (!users[userId]) {
      users[userId] = [];
    }
    users[userId].push(socket.id);
    io.emit('registered',{userId:p,socketId:socket.id})
    console.log(`${userId} registered with socket ID: ${socket.id}`);
  });

  // Listen for chat messages
  socket.on("chat-message", (toUserIds, message) => {
    const targets = Array.isArray(toUserIds) ? toUserIds : [toUserIds];

    targets.forEach((userId) => {
      const receiverSockets = users[userId];
      if (receiverSockets && receiverSockets.length > 0) {
        receiverSockets.forEach((sid) => {
          io.to(sid).emit("chat-message", {
            from: currentUserId,
            socketId: socket.id,
            message,
          });
        });
      } else {
        console.log("User not connected:", userId);
      }
    });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
    // Remove disconnected socket from users list
    for (let userId in users) {
      users[userId] = users[userId].filter((sid) => sid !== socket.id);
      if (users[userId].length === 0) delete users[userId];
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});