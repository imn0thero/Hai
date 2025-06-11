// app.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const usersFile = './data/users.json';
const messagesFile = './data/messages.json';

function loadJSON(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
  return JSON.parse(fs.readFileSync(file));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadMessages() {
  if (!fs.existsSync(messagesFile)) fs.writeFileSync(messagesFile, '{}');
  return JSON.parse(fs.readFileSync(messagesFile));
}

function saveMessages(data) {
  fs.writeFileSync(messagesFile, JSON.stringify(data, null, 2));
}

app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  const users = loadJSON(usersFile);
  if (users.find(u => u.username === username)) return res.status(400).send('Exist');
  users.push({ username, password, online: false });
  saveJSON(usersFile, users);
  res.sendStatus(200);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadJSON(usersFile);
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(400).send('Fail');
  user.online = true;
  saveJSON(usersFile, users);
  res.sendStatus(200);
});

app.get('/users', (req, res) => {
  const users = loadJSON(usersFile);
  res.json(users);
});

app.get('/messages/:pair', (req, res) => {
  const pair = req.params.pair;
  const messages = loadMessages();
  res.json(messages[pair] || []);
});

app.post('/messages/:pair/clear', (req, res) => {
  const pair = req.params.pair;
  const messages = loadMessages();
  messages[pair] = [];
  saveMessages(messages);
  res.sendStatus(200);
});

// SOCKET.IO
const userSockets = {};

io.on('connection', socket => {
  socket.on('register', username => {
    userSockets[username] = socket.id;
    const users = loadJSON(usersFile);
    const user = users.find(u => u.username === username);
    if (user) user.online = true;
    saveJSON(usersFile, users);
    io.emit('update-users', users);
  });

  socket.on('private-message', data => {
    const { from, to, text } = data;
    const pair = [from, to].sort().join('_');
    const messages = loadMessages();
    if (!messages[pair]) messages[pair] = [];
    const msg = { from, to, text, timestamp: Date.now() };
    messages[pair].push(msg);
    saveMessages(messages);

    // Kirim ke pengirim dan penerima jika online
    socket.emit('message', msg);
    const targetSocketId = userSockets[to];
    if (targetSocketId) io.to(targetSocketId).emit('message', msg);
  });

  socket.on('disconnect', () => {
    for (const [username, id] of Object.entries(userSockets)) {
      if (id === socket.id) {
        const users = loadJSON(usersFile);
        const user = users.find(u => u.username === username);
        if (user) user.online = false;
        saveJSON(usersFile, users);
        delete userSockets[username];
        io.emit('update-users', users);
        break;
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
