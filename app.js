const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.json());
app.use(express.static('public'));

let users = JSON.parse(fs.readFileSync('./users.json', 'utf-8'));
let messages = JSON.parse(fs.readFileSync('./messages.json', 'utf-8'));

// Auto delete old messages every minute
setInterval(() => {
    const now = Date.now();
    for (let key in messages) {
        messages[key] = messages[key].filter(msg => now - msg.timestamp < 86400000);
    }
    fs.writeFileSync('./messages.json', JSON.stringify(messages, null, 2));
}, 60000);

app.post('/signup', (req, res) => {
    const { username, password } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ message: 'Username already exists' });
    }
    users.push({ username, password, online: false });
    fs.writeFileSync('./users.json', JSON.stringify(users, null, 2));
    res.json({ message: 'Signup successful' });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    user.online = true;
    fs.writeFileSync('./users.json', JSON.stringify(users, null, 2));
    res.json({ message: 'Login successful' });
});

app.post('/logout', (req, res) => {
    const { username } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        user.online = false;
        fs.writeFileSync('./users.json', JSON.stringify(users, null, 2));
    }
    res.json({ message: 'Logged out' });
});

app.get('/users', (req, res) => {
    res.json(users);
});

app.get('/messages/:pair', (req, res) => {
    const { pair } = req.params;
    res.json(messages[pair] || []);
});

app.post('/messages/:pair', (req, res) => {
    const { pair } = req.params;
    const msg = req.body;
    msg.timestamp = Date.now();
    if (!messages[pair]) messages[pair] = [];
    messages[pair].push(msg);
    fs.writeFileSync('./messages.json', JSON.stringify(messages, null, 2));
    res.json({ message: 'Message sent' });
});

app.post('/delete/:pair', (req, res) => {
    const { pair } = req.params;
    delete messages[pair];
    fs.writeFileSync('./messages.json', JSON.stringify(messages, null, 2));
    res.json({ message: 'Messages deleted' });
});

io.on('connection', socket => {
    socket.on('send-message', data => {
        io.emit('receive-message', data);
    });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
