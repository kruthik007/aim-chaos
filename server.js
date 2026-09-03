/* AIM CHAOS server
   node server.js  ->  http://localhost:3000
   Serves index.html + core.js and runs authoritative game rooms over WebSocket. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Core = require('./core.js');

const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let file = req.url.split('?')[0];
  if (file === '/' || file === '') file = '/index.html';
  const fp = path.join(__dirname, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return rooms.has(c) ? newCode() : c; };
let nextId = 1;

function makeRoom(code) {
  const room = new Core.Room(code, {
    send(pid, msg) { const ws = sockets.get(pid); if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    onEmpty() { rooms.delete(code); console.log('room closed', code); },
  });
  rooms.set(code, room);
  console.log('room created', code);
  return room;
}
const sockets = new Map();

wss.on('connection', ws => {
  const id = 'p' + (nextId++);
  sockets.set(id, ws);
  let room = null;
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'create') {
      if (room) return;
      room = makeRoom(newCode());
      room.addPlayer(id, msg.name, false);
      for (let i = 0; i < Math.min(6, msg.bots | 0); i++) room.addBot();
      return;
    }
    if (msg.type === 'join') {
      if (room) return;
      const r = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!r) return ws.send(JSON.stringify({ type: 'error', text: 'No room with that code' }));
      if (r.state !== 'lobby') return ws.send(JSON.stringify({ type: 'error', text: 'That match already started. Wait for it to finish.' }));
      if (!r.addPlayer(id, msg.name, false)) return ws.send(JSON.stringify({ type: 'error', text: 'Room is full (8 players)' }));
      room = r;
      return;
    }
    if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', t: msg.t, now: Date.now() }));
    if (room) room.handle(id, msg);
  });
  ws.on('close', () => { sockets.delete(id); if (room) room.removePlayer(id); });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('AIM CHAOS running at http://localhost:' + PORT);
  console.log('Friends on the same wifi: use your LAN IP. Over the internet: expose with ngrok or deploy.');
});
