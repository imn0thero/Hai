const socket = io();
const user = localStorage.getItem('user');
const target = localStorage.getItem('target');

if (location.pathname.endsWith('index.html') && user) {
  document.getElementById('currentUser').textContent = user;
  fetch('/users')
    .then(res => res.json())
    .then(users => {
      const list = document.getElementById('userList');
      const input = document.getElementById('search');
      input.addEventListener('input', () => render(users));
      function render(data) {
        const filtered = data.filter(u => u.username !== user && u.username.includes(input.value));
        list.innerHTML = filtered.map(u => `<div onclick="startChat('${u.username}')">${u.username} - ${u.online ? '🟢' : '⚪'}</div>`).join('');
      }
      render(users);
    });
}

if (location.pathname.endsWith('chat.html') && user && target) {
  document.getElementById('chatWith').textContent = target;
  fetch('/users').then(res => res.json()).then(users => {
    const t = users.find(u => u.username === target);
    document.getElementById('status').textContent = t?.online ? '🟢 online' : '⚪ offline';
  });
  const pair = [user, target].sort().join('-');
  fetch(`/messages/${pair}`)
    .then(res => res.json())
    .then(msgs => renderMessages(msgs));

  socket.on('receive-message', data => {
    if ([data.from, data.to].includes(user) && [data.from, data.to].includes(target)) {
      addMessage(data);
    }
  });
}

function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then(res => res.json()).then(data => {
    if (data.message === 'Login successful') {
      localStorage.setItem('user', username);
      location.href = 'index.html';
    } else alert(data.message);
  });
}

function signup() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  fetch('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then(res => res.json()).then(data => {
    if (data.message === 'Signup successful') {
      alert('Signup success, please login.');
      location.href = 'login.html';
    } else alert(data.message);
  });
}

function logout() {
  fetch('/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user })
  }).then(() => {
    localStorage.clear();
    location.href = 'login.html';
  });
}

function startChat(username) {
  localStorage.setItem('target', username);
  location.href = 'chat.html';
}

function sendMessage() {
  const text = document.getElementById('messageInput').value;
  if (!text) return;
  const msg = { from: user, to: target, text };
  const pair = [user, target].sort().join('-');
  fetch(`/messages/${pair}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg)
  });
  socket.emit('send-message', msg);
  addMessage(msg);
  document.getElementById('messageInput').value = '';
}

function addMessage(msg) {
  const div = document.createElement('div');
  div.className = 'chat-bubble ' + (msg.from === user ? 'sent' : 'received');
  div.textContent = msg.text;
  document.getElementById('chatBox').appendChild(div);
  div.scrollIntoView();
}

function renderMessages(msgs) {
  const box = document.getElementById('chatBox');
  box.innerHTML = '';
  msgs.forEach(m => addMessage(m));
}

function deleteMessages() {
  const pair = [user, target].sort().join('-');
  fetch(`/delete/${pair}`, { method: 'POST' }).then(() => {
    document.getElementById('chatBox').innerHTML = '';
  });
}

function backToIndex() {
  location.href = 'index.html';
}

function toggleMode() {
  document.body.classList.toggle('dark-mode');
}
