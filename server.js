const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const secretKey = process.env.SOCKET_SERVER_SECRET || 'secret';

// Express Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*', // Customize this in production to match your frontend domain
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling']
});

// HTTP health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', clients: io.engine.clientsCount });
});

// Trigger endpoint to broadcast messages from Next.js serverless routes
app.post('/trigger', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== secretKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  const { channel, event, data } = req.body;
  if (!channel || !event) {
    return res.status(400).json({ error: 'Missing channel or event' });
  }

  console.log(`[Socket Server Trigger] Broad-casting event "${event}" to channel "${channel}"`, data);

  // 1. Broadcast the specific event directly to the room
  io.to(channel).emit(event, data);

  // 2. Broadcast a generic channel-event with channel metadata (robust wrapper routing)
  io.to(channel).emit('channel-event', { channel, event, data });

  return res.status(200).json({ success: true });
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`[Socket.io Server] Client connected: ${socket.id}`);

  // Handle client joining a restaurant channel/room
  socket.on('join-channel', (channelName) => {
    if (!channelName) return;
    socket.join(channelName);
    console.log(`[Socket.io Server] Socket ${socket.id} joined room: ${channelName}`);
    
    // Mimic subscription succeeded event to client
    socket.emit('subscription_succeeded', { channel: channelName });
  });

  // Handle client leaving a restaurant channel/room
  socket.on('leave-channel', (channelName) => {
    if (!channelName) return;
    socket.leave(channelName);
    console.log(`[Socket.io Server] Socket ${socket.id} left room: ${channelName}`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.io Server] Client disconnected: ${socket.id} (${reason})`);
  });
});

// Start the server
server.listen(port, () => {
  console.log(`=========================================`);
  console.log(`🚀 Socket.io Server running on port ${port}`);
  console.log(`🔑 Webhook Trigger Auth Secret: ${secretKey}`);
  console.log(`=========================================`);
});
