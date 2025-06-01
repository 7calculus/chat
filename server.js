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
app.use(express.static('public'));

// Store rooms and users
const rooms = {};
const users = {};

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      console.log(`${user.username} disconnected from ${user.roomId}`);
      
      // Remove from room
      if (rooms[user.roomId]) {
        rooms[user.roomId] = rooms[user.roomId].filter(u => u.id !== socket.id);
        
        // Notify others in room
        socket.to(user.roomId).emit('user-left', {
          username: user.username,
          message: `${user.username} left the chat`
        });
        
        // Clean up empty rooms
        if (rooms[user.roomId].length === 0) {
          delete rooms[user.roomId];
        }
      }
      
      delete users[socket.id];
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to test the chat`);
});