const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const USERS_FILE = path.join(__dirname, 'users.json');
const MSG_FILE = path.join(__dirname, 'messages.json');

app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

app.use(express.static(__dirname));

app.get('/users.json', (req, res) => {
  res.sendFile(USERS_FILE);
});

app.get('/messages.json', (req, res) => {
  res.sendFile(MSG_FILE);
});
app.post('/signup', (req, res) => {
  // ...logika...
  res.json({ success: true }); // HARUS ADA ini
});

app.post('/login', (req, res) => {
  // ...logika...
  res.json({ success: true }); // HARUS ADA ini
});

let onlineUsers = [];

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return {};
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function cleanupOldMessages() {
  const data = readJSON(MSG_FILE);
  const now = Date.now();
  let changed = false;
  for (const key in data) {
    data[key] = data[key].filter(msg => now - msg.timestamp < 24 * 3600 * 1000);
    if (!data[key].length) delete data[key];
    changed = true;
  }
  if (changed) saveJSON(MSG_FILE, data);
}

setInterval(cleanupOldMessages, 60 * 1000);

io.on('connection', socket => {
  let currentUser = null;

  socket.on('signup', ({ username, password }) => {
    const users = readJSON(USERS_FILE);
    if (users[username]) {
      socket.emit('signupResult', { success: false, message: 'Username sudah digunakan' });
    } else {
      users[username] = password;
      saveJSON(USERS_FILE, users);
      socket.emit('signupResult', { success: true });
    }
  });

  socket.on('login', ({ username, password }) => {
    const users = readJSON(USERS_FILE);
    if (users[username] === password) {
      currentUser = username;
      if (!onlineUsers.includes(username)) onlineUsers.push(username);
      socket.emit('loginResult', { success: true });
      io.emit('userList', onlineUsers);
    } else {
      socket.emit('loginResult', { success: false });
    }
  });

  socket.on('joinPrivateRoom', ({ user1, user2 }) => {
    const room = [user1, user2].sort().join('__');
    socket.join(room);

    const data = readJSON(MSG_FILE);
    const messages = (data[room] || []).filter(m => Date.now() - m.timestamp < 24 * 3600 * 1000);
    socket.emit('loadMessages', messages);
  });

  socket.on('privateMessage', ({ from, to, text }) => {
    const room = [from, to].sort().join('__');
    const data = readJSON(MSG_FILE);
    if (!data[room]) data[room] = [];
    const message = { sender: from, receiver: to, text, timestamp: Date.now() };
    data[room].push(message);
    saveJSON(MSG_FILE, data);
    io.to(room).emit('newMessage', message);
  });

  socket.on('clearConversation', ({ user1, user2 }) => {
    const data = readJSON(MSG_FILE);
    const room = [user1, user2].sort().join('__');
    if (data[room]) {
      delete data[room];
      saveJSON(MSG_FILE, data);
      io.to(room).emit('loadMessages', []);
    }
  });

  socket.on('requestStatus', username => {
    socket.emit('statusResult', onlineUsers.includes(username));
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      onlineUsers = onlineUsers.filter(u => u !== currentUser);
      io.emit('userList', onlineUsers);
    }
  });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
