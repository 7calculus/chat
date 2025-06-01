const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files

// Store active rooms and users
const rooms = new Map();
const users = new Map();

// Serve the chat app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining a room
  socket.on('join-room', (data) => {
    const { username, roomId } = data;
    
    // Leave any previous rooms
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
      }
    });

    // Join the new room
    socket.join(roomId);
    
    // Store user info
    users.set(socket.id, { username, roomId });
    
    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    
    // Add user to room
    rooms.get(roomId).add({
      id: socket.id,
      username
    });

    console.log(`${username} joined room: ${roomId}`);
    
    // Notify user they've connected
    socket.emit('connected', {
      message: 'Successfully connected to chat',
      roomId,
      username
    });
    
    // Notify others in room that user joined
    socket.to(roomId).emit('user-joined', {
      username,
      message: `${username} joined the chat`
    });
    
    // Send current room users to the new user
    const roomUsers = Array.from(rooms.get(roomId)).map(user => user.username);
    socket.emit('room-users', roomUsers);
  });

  // Handle sending messages
  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const messageData = {
      id: Date.now() + Math.random(),
      username: user.username,
      message: data.message,
      timestamp: new Date().toISOString(),
      roomId: user.roomId
    };

    console.log(`Message from ${user.username} in ${user.roomId}: ${data.message}`);
    
    // Send message to all users in the room (including sender for confirmation)
    io.to(user.roomId).emit('receive-message', messageData);
  });

  // Handle typing indicators
  socket.on('typing-start', () => {
    const user = users.get(socket.id);
    if (!user) return;
    
    socket.to(user.roomId).emit('user-typing', {
      username: user.username,
      isTyping: true
    });
  });

  socket.on('typing-stop', () => {
    const user = users.get(socket.id);
    if (!user) return;
    
    socket.to(user.roomId).emit('user-typing', {
      username: user.username,
      isTyping: false
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`${user.username} disconnected from room: ${user.roomId}`);
      
      // Remove user from room
      if (rooms.has(user.roomId)) {
        const roomUsers = rooms.get(user.roomId);
        roomUsers.forEach(roomUser => {
          if (roomUser.id === socket.id) {
            roomUsers.delete(roomUser);
          }
        });
        
        // Clean up empty rooms
        if (roomUsers.size === 0) {
          rooms.delete(user.roomId);
        }
      }
      
      // Notify others in room
      socket.to(user.roomId).emit('user-left', {
        username: user.username,
        message: `${user.username} left the chat`
      });
      
      users.delete(socket.id);
    }
    
    console.log(`User disconnected: ${socket.id}`);
  });
});

// API endpoints for health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size,
    activeUsers: users.size
  });
});

app.get('/api/rooms', (req, res) => {
  const roomData = {};
  rooms.forEach((users, roomId) => {
    roomData[roomId] = Array.from(users).map(user => user.username);
  });
  res.json(roomData);
});

server.listen(PORT, () => {
  console.log(`🚀 Chat server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} to use the chat app`);
});