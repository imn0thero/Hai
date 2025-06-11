==== SERVER.JS ======
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Init JSON files
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}));
}
if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify({}));
}

let messages = loadMessages();
let onlineUsers = {};
let userSockets = {};

// Auto-delete messages older than 24 hours
setInterval(() => {
    const now = Date.now();
    let hasChanges = false;
    
    Object.keys(messages).forEach(chatId => {
        const originalLength = messages[chatId].length;
        messages[chatId] = messages[chatId].filter(m => now - m.time < 24 * 60 * 60 * 1000);
        if (messages[chatId].length !== originalLength) {
            hasChanges = true;
        }
    });
    
    if (hasChanges) {
        saveMessages(messages);
        console.log('Pesan lama telah dihapus otomatis');
    }
}, 60 * 1000);

// Helper functions
function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadMessages() {
    try {
        return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function saveMessages(msgs) {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgs, null, 2));
}

function generateChatId(user1, user2) {
    return [user1, user2].sort().join('_');
}

function getUserChats(username) {
    const users = loadUsers();
    const allUsers = Object.keys(users).filter(user => user !== username);
    const chats = [];
    
    allUsers.forEach(otherUser => {
        const chatId = generateChatId(username, otherUser);
        const chatMessages = messages[chatId] || [];
        const lastMessage = chatMessages[chatMessages.length - 1];
        
        const unreadCount = chatMessages.filter(msg => 
            msg.sender !== username && !msg.readBy?.includes(username)
        ).length;
        
        chats.push({
            chatId,
            otherUser,
            isOnline: onlineUsers[otherUser] ? true : false,
            lastMessage: lastMessage ? {
                text: lastMessage.text,
                time: lastMessage.time,
                sender: lastMessage.sender
            } : null,
            unreadCount
        });
    });
    
    chats.sort((a, b) => {
        const timeA = a.lastMessage ? a.lastMessage.time : 0;
        const timeB = b.lastMessage ? b.lastMessage.time : 0;
        return timeB - timeA;
    });
    
    return chats;
}

// Socket.IO handlers
io.on('connection', socket => {
    let currentUser = null;

    socket.on('signup', data => {
        const users = loadUsers();
        const { username, password } = data;
        
        if (!username || !password) {
            socket.emit('signupResult', { success: false, message: 'Username dan password wajib diisi' });
            return;
        }
        
        if (username.length < 3) {
            socket.emit('signupResult', { success: false, message: 'Username minimal 3 karakter' });
            return;
        }
        
        if (users[username]) {
            socket.emit('signupResult', { success: false, message: 'Username sudah dipakai' });
        } else {
            users[username] = { password, createdAt: Date.now() };
            saveUsers(users);
            socket.emit('signupResult', { success: true, message: 'Akun berhasil dibuat' });
        }
    });

    socket.on('login', data => {
        const users = loadUsers();
        const { username, password } = data;
        
        if (!username || !password) {
            socket.emit('loginResult', { success: false, message: 'Username dan password wajib diisi' });
            return;
        }
        
        const user = users[username];
        if (user && user.password === password) {
            currentUser = username;
            onlineUsers[currentUser] = socket.id;
            userSockets[socket.id] = currentUser;

            const userChats = getUserChats(currentUser);
            socket.emit('loginResult', { 
                success: true, 
                user: currentUser, 
                chats: userChats 
            });

            socket.broadcast.emit('userOnlineStatus', { 
                username: currentUser, 
                isOnline: true 
            });
        } else {
            socket.emit('loginResult', { success: false, message: 'Username atau password salah' });
        }
    });

    socket.on('searchUsers', data => {
        if (!currentUser) return;
        
        const users = loadUsers();
        const searchTerm = data.search.toLowerCase();
        const results = Object.keys(users)
            .filter(username => 
                username !== currentUser && 
                username.toLowerCase().includes(searchTerm)
            )
            .map(username => ({
                username,
                isOnline: onlineUsers[username] ? true : false
            }));
            
        socket.emit('searchResults', results);
    });

    socket.on('getChatMessages', data => {
        if (!currentUser || !data.otherUser) return;
        
        const chatId = generateChatId(currentUser, data.otherUser);
        const chatMessages = messages[chatId] || [];
        
        socket.emit('chatMessages', {
            chatId,
            otherUser: data.otherUser,
            messages: chatMessages,
            isOnline: onlineUsers[data.otherUser] ? true : false
        });
    });

    socket.on('privateMessage', data => {
        if (!currentUser || !data.to || !data.text?.trim()) return;

        const messageData = {
            id: uuidv4(),
            sender: currentUser,
            receiver: data.to,
            text: data.text.trim(),
            time: Date.now(),
            readBy: [currentUser]
        };

        const chatId = generateChatId(currentUser, data.to);
        
        if (!messages[chatId]) {
            messages[chatId] = [];
        }
        
        messages[chatId].push(messageData);
        saveMessages(messages);

        const receiverSocketId = onlineUsers[data.to];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('newMessage', {
                chatId,
                message: messageData,
                fromUser: currentUser
            });
        }

        socket.emit('messageSent', {
            chatId,
            message: messageData,
            delivered: receiverSocketId ? true : false
        });

        // Update chat lists
        const senderChats = getUserChats(currentUser);
        socket.emit('updateChatList', senderChats);
        
        if (receiverSocketId) {
            const receiverChats = getUserChats(data.to);
            io.to(receiverSocketId).emit('updateChatList', receiverChats);
        }
    });

    socket.on('markAsRead', data => {
        if (!currentUser || !data.chatId) return;
        
        const chatMessages = messages[data.chatId] || [];
        let hasUpdates = false;
        
        chatMessages.forEach(msg => {
            if (msg.sender !== currentUser && !msg.readBy?.includes(currentUser)) {
                if (!msg.readBy) msg.readBy = [];
                msg.readBy.push(currentUser);
                hasUpdates = true;
            }
        });
        
        if (hasUpdates) {
            saveMessages(messages);
            
            const otherUser = data.chatId.split('_').find(user => user !== currentUser);
            const otherUserSocketId = onlineUsers[otherUser];
            
            if (otherUserSocketId) {
                io.to(otherUserSocketId).emit('messagesRead', {
                    chatId: data.chatId,
                    readBy: currentUser
                });
            }
        }
    });

    socket.on('deleteAllMessages', data => {
        if (!currentUser || !data.chatId) return;
        
        // Delete all messages in chat
        messages[data.chatId] = [];
        saveMessages(messages);
        
        // Notify both users
        const otherUser = data.chatId.split('_').find(user => user !== currentUser);
        const otherUserSocketId = onlineUsers[otherUser];
        
        socket.emit('messagesDeleted', { chatId: data.chatId });
        
        if (otherUserSocketId) {
            io.to(otherUserSocketId).emit('messagesDeleted', { chatId: data.chatId });
        }
        
        // Update chat lists
        const senderChats = getUserChats(currentUser);
        socket.emit('updateChatList', senderChats);
        
        if (otherUserSocketId) {
            const receiverChats = getUserChats(otherUser);
            io.to(otherUserSocketId).emit('updateChatList', receiverChats);
        }
    });

    socket.on('typing', data => {
        if (!currentUser || !data.to) return;
        
        const receiverSocketId = onlineUsers[data.to];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('userTyping', {
                user: currentUser,
                isTyping: data.isTyping
            });
        }
    });

    socket.on('logout', () => {
        if (currentUser) {
            delete onlineUsers[currentUser];
            delete userSockets[socket.id];
            
            socket.broadcast.emit('userOnlineStatus', { 
                username: currentUser, 
                isOnline: false 
            });
            
            currentUser = null;
        }
    });

    socket.on('disconnect', () => {
        if (currentUser) {
            delete onlineUsers[currentUser];
            delete userSockets[socket.id];
            
            socket.broadcast.emit('userOnlineStatus', { 
                username: currentUser, 
                isOnline: false 
            });
        }
    });
});

http.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});

