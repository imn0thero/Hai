const express = require('express');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(__dirname + '/public'));
app.use(express.json());

const USERS_FILE = './data/users.json';
const MESSAGES_FILE = './data/messages.json';

function readJson(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Cek login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readJson(USERS_FILE);
  const found = users.find(u => u.username === username && u.password === password);
  if (found) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Login gagal' });
  }
});

// Signup
app.post('/api/signup', (req, res) => {
  const { username, password } = req.body;
  const users = readJson(USERS_FILE);
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ success: false, message: 'Username sudah ada' });
  }
  users.push({ username, password });
  writeJson(USERS_FILE, users);
  res.json({ success: true });
});

// Kirim pesan
app.post('/messages', (req, res) => {
  const msg = req.body;
  const messages = readJson(MESSAGES_FILE);
  messages.push(msg);
  writeJson(MESSAGES_FILE, messages);
  res.json({ success: true });
});

// Ambil pesan antar 2 user
app.get('/messages/:user1/:user2', (req, res) => {
  const { user1, user2 } = req.params;
  const messages = readJson(MESSAGES_FILE);
  const filtered = messages.filter(
    m => (m.from === user1 && m.to === user2) || (m.from === user2 && m.to === user1)
  );
  res.json(filtered);
});

// Hapus semua pesan antar 2 user
app.delete('/messages/:user1/:user2', (req, res) => {
  const { user1, user2 } = req.params;
  let messages = readJson(MESSAGES_FILE);
  messages = messages.filter(
    m => !( (m.from === user1 && m.to === user2) || (m.from === user2 && m.to === user1) )
  );
  writeJson(MESSAGES_FILE, messages);
  res.json({ success: true });
});

// Daftar pengguna
app.get('/api/users', (req, res) => {
  const users = readJson(USERS_FILE);
  res.json(users.map(u => u.username));
});

// Terakhir pesan tiap user untuk index
app.get('/api/last-messages/:user', (req, res) => {
  const { user } = req.params;
  const messages = readJson(MESSAGES_FILE);
  const chatMap = {};
  for (const m of messages) {
    const other = m.from === user ? m.to : (m.to === user ? m.from : null);
    if (!other) continue;
    if (!chatMap[other] || m.time > chatMap[other].time) {
      chatMap[other] = m;
    }
  }
  res.json(Object.values(chatMap));
});

// Hapus otomatis pesan > 24 jam
setInterval(() => {
  let messages = readJson(MESSAGES_FILE);
  const now = Date.now();
  messages = messages.filter(msg => now - msg.time < 24 * 3600000);
  writeJson(MESSAGES_FILE, messages);
}, 3600000); // setiap 1 jam

// Socket.IO untuk status online dan chat
let onlineUsers = {};

io.on('connection', socket => {
  socket.on('join', username => {
    onlineUsers[username] = socket.id;
    io.emit('onlineStatus', username, true);
  });

  socket.on('disconnect', () => {
    for (const user in onlineUsers) {
      if (onlineUsers[user] === socket.id) {
        delete onlineUsers[user];
        io.emit('onlineStatus', user, false);
      }
    }
  });

  socket.on('checkOnline', username => {
    const isOnline = !!onlineUsers[username];
    socket.emit('onlineStatus', username, isOnline);
  });

  socket.on('privateMessage', msg => {
    const targetSocket = onlineUsers[msg.to];
    if (targetSocket) {
      io.to(targetSocket).emit('privateMessage', msg);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
