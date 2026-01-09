const { v4: uuidv4 } = require('uuid');

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> { participants: Set, host: string }
  }

  createRoom() {
    const roomId = uuidv4().slice(0, 8); // Short ID for easy sharing
    this.rooms.set(roomId, {
      participants: new Set(),
      host: null,
      createdAt: Date.now(),
    });
    
    // Cleanup room after 24 hours
    setTimeout(() => {
      this.deleteRoom(roomId);
    }, 24 * 60 * 60 * 1000);
    
    return roomId;
  }

  joinRoom(roomId, clientId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }
    
    room.participants.add(clientId);
    
    // Set first participant as host
    if (!room.host) {
      room.host = clientId;
    }
    
    return {
      roomId,
      participants: Array.from(room.participants),
      host: room.host,
      isHost: clientId === room.host
    };
  }

  leaveRoom(roomId, clientId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.participants.delete(clientId);
    
    // If host leaves, assign new host
    if (room.host === clientId && room.participants.size > 0) {
      room.host = room.participants.values().next().value;
    }
    
    // Delete room if empty
    if (room.participants.size === 0) {
      this.deleteRoom(roomId);
    }
    
    return Array.from(room.participants);
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }

  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    return {
      roomId,
      participantCount: room.participants.size,
      host: room.host,
      participants: Array.from(room.participants),
      isActive: room.participants.size > 0
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

module.exports = RoomManager;