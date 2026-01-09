const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(roomId = null) {
    const id = roomId || uuidv4().slice(0, 8);
    
    if (this.rooms.has(id)) {
      throw new Error('Room already exists');
    }
    
    this.rooms.set(id, {
      participants: new Set(),
      host: null,
      createdAt: Date.now(),
    });
    
    // Cleanup room after 1 hour of inactivity
    setTimeout(() => {
      if (this.rooms.has(id) && this.rooms.get(id).participants.size === 0) {
        this.deleteRoom(id);
        console.log(`Room ${id} cleaned up due to inactivity`);
      }
    }, 60 * 60 * 1000);
    
    return id;
  }

  joinRoom(roomId, clientId) {
    // Create room if it doesn't exist
    if (!this.rooms.has(roomId)) {
      this.createRoom(roomId);
    }
    
    const room = this.rooms.get(roomId);
    room.participants.add(clientId);
    
    // Set first participant as host
    if (!room.host) {
      room.host = clientId;
    }
    
    return {
      roomId,
      participants: Array.from(room.participants),
      host: room.host,
      isHost: clientId === room.host,
      participantCount: room.participants.size
    };
  }

  leaveRoom(roomId, clientId) {
    if (!this.rooms.has(roomId)) return null;
    
    const room = this.rooms.get(roomId);
    room.participants.delete(clientId);
    
    // If host leaves, assign new host
    if (room.host === clientId && room.participants.size > 0) {
      room.host = Array.from(room.participants)[0];
    }
    
    // Delete room if empty
    if (room.participants.size === 0) {
      this.deleteRoom(roomId);
      return null;
    }
    
    return {
      participants: Array.from(room.participants),
      host: room.host
    };
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
    console.log(`Room ${roomId} deleted`);
  }

  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    return {
      roomId,
      participantCount: room.participants.size,
      host: room.host,
      participants: Array.from(room.participants)
    };
  }

  getAllRooms() {
    const rooms = [];
    for (const [roomId, room] of this.rooms) {
      rooms.push({
        roomId,
        participantCount: room.participants.size,
        createdAt: room.createdAt
      });
    }
    return rooms;
  }
}

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.roomManager = new RoomManager();
    this.clients = new Map(); // clientId -> { ws, roomId, userId, userName }
    
    this.setupWebSocket();
    console.log('WebSocket server initialized');
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      console.log(`New WebSocket connection: ${clientId}`);
      
      // Store client
      this.clients.set(clientId, { 
        ws, 
        roomId: null, 
        userId: null, 
        userName: null,
        ip: req.socket.remoteAddress 
      });
      
      // Send welcome message
      this.sendToClient(ws, {
        type: 'welcome',
        clientId,
        timestamp: Date.now(),
        message: 'Connected to signaling server'
      });
      
      // Handle messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (error) {
          console.error('Error parsing message:', error);
          this.sendToClient(ws, {
            type: 'error',
            message: 'Invalid message format',
            error: error.message
          });
        }
      });
      
      // Handle disconnection
      ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        this.handleDisconnect(clientId);
      });
      
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.handleDisconnect(clientId);
      });
    });
    
    // Periodic cleanup
    setInterval(() => {
      this.cleanupStaleConnections();
    }, 30000); // Every 30 seconds
  }

  handleMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.ws) {
      console.error(`No client found for ID: ${clientId}`);
      return;
    }
    
    console.log(`Message from ${clientId}: ${data.type}`);
    
    try {
      switch (data.type) {
        case 'create-room':
          this.handleCreateRoom(clientId, client.ws);
          break;
        
        case 'join-room':
          this.handleJoinRoom(clientId, client.ws, data.roomId, data.userData);
          break;
        
        case 'leave-room':
          this.handleLeaveRoom(clientId, data.roomId);
          break;
        
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          this.handleWebRTCMessage(clientId, data);
          break;
        
        case 'chat-message':
          this.handleChatMessage(clientId, data);
          break;
        
        case 'user-update':
          this.handleUserUpdate(clientId, data);
          break;
        
        case 'ping':
          this.sendToClient(client.ws, { type: 'pong', timestamp: Date.now() });
          break;
        
        default:
          console.warn(`Unknown message type: ${data.type}`);
          this.sendToClient(client.ws, {
            type: 'error',
            message: `Unknown message type: ${data.type}`
          });
      }
    } catch (error) {
      console.error(`Error handling message from ${clientId}:`, error);
      this.sendToClient(client.ws, {
        type: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  handleCreateRoom(clientId, ws) {
    try {
      const roomId = this.roomManager.createRoom();
      const roomInfo = this.roomManager.joinRoom(roomId, clientId);
      
      const client = this.clients.get(clientId);
      if (client) {
        client.roomId = roomId;
      }
      
      this.sendToClient(ws, {
        type: 'room-created',
        roomId,
        roomInfo,
        timestamp: Date.now()
      });
      
      console.log(`Room created: ${roomId} by ${clientId}`);
    } catch (error) {
      console.error('Failed to create room:', error);
      this.sendToClient(ws, {
        type: 'error',
        message: 'Failed to create room',
        error: error.message
      });
    }
  }

  handleJoinRoom(clientId, ws, roomId, userData) {
    try {
      if (!roomId || typeof roomId !== 'string' || roomId.trim() === '') {
        throw new Error('Invalid room ID');
      }
      
      const roomInfo = this.roomManager.joinRoom(roomId, clientId);
      
      const client = this.clients.get(clientId);
      if (client) {
        client.roomId = roomId;
        client.userId = userData?.userId || `user-${clientId.slice(0, 4)}`;
        client.userName = userData?.userName || 'Anonymous';
      }
      
      // Notify the joining client
      this.sendToClient(ws, {
        type: 'room-joined',
        roomId,
        roomInfo,
        yourId: clientId,
        timestamp: Date.now()
      });
      
      // Notify other participants in the room
      this.broadcastToRoom(roomId, clientId, {
        type: 'user-joined',
        clientId: clientId,
        userData: {
          userId: client.userId,
          userName: client.userName
        },
        timestamp: Date.now()
      });
      
      // Send list of existing participants to the new joiner
      const existingParticipants = [];
      for (const [cid, cData] of this.clients) {
        if (cid !== clientId && cData.roomId === roomId) {
          existingParticipants.push({
            clientId: cid,
            userId: cData.userId,
            userName: cData.userName
          });
        }
      }
      
      if (existingParticipants.length > 0) {
        this.sendToClient(ws, {
          type: 'existing-participants',
          participants: existingParticipants,
          timestamp: Date.now()
        });
      }
      
      console.log(`Client ${clientId} joined room ${roomId}`);
      
    } catch (error) {
      console.error(`Failed to join room ${roomId}:`, error);
      this.sendToClient(ws, {
        type: 'error',
        message: 'Failed to join room',
        error: error.message,
        roomId
      });
    }
  }

  handleLeaveRoom(clientId, roomId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const actualRoomId = roomId || client.roomId;
    if (!actualRoomId) return;
    
    const remainingInfo = this.roomManager.leaveRoom(actualRoomId, clientId);
    
    // Notify other participants
    this.broadcastToRoom(actualRoomId, clientId, {
      type: 'user-left',
      clientId,
      userData: {
        userId: client.userId,
        userName: client.userName
      },
      timestamp: Date.now()
    });
    
    // Clean up client data
    client.roomId = null;
    
    // Notify leaving client
    if (client.ws.readyState === 1) { // OPEN
      this.sendToClient(client.ws, {
        type: 'room-left',
        roomId: actualRoomId,
        timestamp: Date.now()
      });
    }
    
    console.log(`Client ${clientId} left room ${actualRoomId}`);
  }

  handleWebRTCMessage(senderId, data) {
    const sender = this.clients.get(senderId);
    if (!sender || !sender.roomId) {
      console.error(`Sender ${senderId} not in a room`);
      return;
    }
    
    const { target, ...messageData } = data;
    
    if (!target) {
      console.error('No target specified for WebRTC message');
      return;
    }
    
    // Forward the WebRTC message to the target client
    const targetClient = this.clients.get(target);
    if (targetClient && targetClient.ws.readyState === 1) { // OPEN
      this.sendToClient(targetClient.ws, {
        ...messageData,
        sender: senderId
      });
    } else {
      console.error(`Target client ${target} not found or not connected`);
    }
  }

  handleChatMessage(senderId, data) {
    const sender = this.clients.get(senderId);
    if (!sender || !sender.roomId) return;
    
    // Broadcast chat message to all participants in the room
    this.broadcastToRoom(sender.roomId, senderId, {
      type: 'chat-message',
      senderId,
      userData: {
        userId: sender.userId,
        userName: sender.userName
      },
      message: data.message,
      timestamp: Date.now()
    });
  }

  handleUserUpdate(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomId) return;
    
    // Update user data
    if (data.userName) client.userName = data.userName;
    if (data.userId) client.userId = data.userId;
    
    // Broadcast user update to room
    this.broadcastToRoom(client.roomId, clientId, {
      type: 'user-updated',
      clientId,
      userData: {
        userId: client.userId,
        userName: client.userName
      },
      updates: data,
      timestamp: Date.now()
    });
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (client && client.roomId) {
      this.handleLeaveRoom(clientId, client.roomId);
    }
    this.clients.delete(clientId);
    console.log(`Client ${clientId} removed`);
  }

  broadcastToRoom(roomId, excludeClientId, message) {
    let count = 0;
    for (const [clientId, client] of this.clients) {
      if (clientId !== excludeClientId && 
          client.roomId === roomId && 
          client.ws.readyState === 1) { // OPEN
        this.sendToClient(client.ws, message);
        count++;
      }
    }
    console.log(`Broadcast to ${count} clients in room ${roomId}`);
  }

  sendToClient(ws, message) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message to client:', error);
      }
    }
  }

  cleanupStaleConnections() {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const [clientId, client] of this.clients) {
      // Check if WebSocket is closed
      if (client.ws.readyState > 1) { // CLOSING or CLOSED
        console.log(`Removing stale connection: ${clientId}`);
        this.handleDisconnect(clientId);
      }
    }
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      totalRooms: this.roomManager.getAllRooms().length,
      activeRooms: this.roomManager.getAllRooms().filter(room => room.participantCount > 0).length,
      connectedClients: Array.from(this.clients.values()).filter(c => c.ws.readyState === 1).length
    };
  }
}

module.exports = WebSocketServer;