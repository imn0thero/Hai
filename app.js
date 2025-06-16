const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const JWT_SECRET = 'rahasia_super_aman'; // Ganti di production!

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Init files
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));

let messages = loadMessages();
let onlineUsers = {};

setInterval(() => {
  const now = Date.now();
  messages = messages.filter(m => now - m.time < 24 * 60 * 60 * 1000);
  saveMessages(messages);
}, 60 * 1000);

// Helpers
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadMessages() {
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveMessages(msgs) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgs, null, 2));
}

// Socket.IO
io.on('connection', socket => {
  let currentUser = null;

  socket.on('signup', async ({ username, password }) => {
    const users = loadUsers();
    if (!username || !password) {
      return socket.emit('signupResult', { success: false, message: 'Username dan password wajib diisi' });
    }
    if (users[username]) {
      return socket.emit('signupResult', { success: false, message: 'Username sudah digunakan' });
    }

    const hashed = await bcrypt.hash(password, 10);
    users[username] = hashed;
    saveUsers(users);
    socket.emit('signupResult', { success: true });
  });

  socket.on('login', async ({ username, password }) => {
    const users = loadUsers();
    const hashed = users[username];
    if (!hashed || !await bcrypt.compare(password, hashed)) {
      return socket.emit('loginResult', { success: false, message: 'Username atau password salah' });
    }

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1d' });
    currentUser = username;
    onlineUsers[username] = true;

    socket.emit('loginResult', { success: true, token, user: username, messages });
    io.emit('userList', Object.keys(onlineUsers));
  });

  socket.on('auth', token => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      currentUser = decoded.username;
      onlineUsers[currentUser] = true;
      socket.emit('authSuccess', { user: currentUser, messages });
      io.emit('userList', Object.keys(onlineUsers));
    } catch {
      socket.emit('authFailed');
    }
  });

  socket.on('message', data => {
    if (!currentUser || !data.text || data.text.trim() === "") return;
    const msg = {
      id: uuidv4(),
      user: currentUser,
      text: data.text.trim(),
      time: Date.now()
    };
    messages.push(msg);
    saveMessages(messages);
    io.emit('message', msg);
  });

  socket.on('logout', () => {
    if (currentUser) {
      delete onlineUsers[currentUser];
      io.emit('userList', Object.keys(onlineUsers));
      currentUser = null;
    }
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      delete onlineUsers[currentUser];
      io.emit('userList', Object.keys(onlineUsers));
      currentUser = null;
    }
  });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
