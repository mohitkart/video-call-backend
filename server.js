const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    origin: process.env.FRONTEND || "*",
});

const PORT = process.env.PORT || 5000;

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