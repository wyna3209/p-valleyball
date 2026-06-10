const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const C = require('./constants');

const app = express();
app.use(cors());

const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
const indexHtmlPath = path.join(frontendDistPath, 'index.html');

if (fs.existsSync(indexHtmlPath)) {
  app.use(express.static(frontendDistPath));
}

const httpServer = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL ?? '*';
const io = new Server(httpServer, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] },
});

// ─── Room management ─────────────────────────────────────────────────────────

const rooms = {};

function createInitialState() {
  const floorY = C.FLOOR_Y - C.PLAYER_HEIGHT / 2;
  return {
    players: {
      p1: { x: 200, y: floorY, vx: 0, vy: 0, isJumping: false },
      p2: { x: 600, y: floorY, vx: 0, vy: 0, isJumping: false },
    },
    ball: { x: C.GAME_WIDTH / 2, y: 150, vx: 3, vy: -5, hitCooldown: 0 },
    score: { p1: 0, p2: 0 },
    status: 'waiting',
    countdown: 0,
    winner: null,
  };
}

function getOrCreateRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      players: {
        p1: { socketId: null, input: { left: false, right: false, jump: false } },
        p2: { socketId: null, input: { left: false, right: false, jump: false } },
      },
      state: createInitialState(),
      status: 'waiting',
      restartScheduled: false,
      countdownTimer: null,
      lastTime: Date.now(),
    };
  }
  return rooms[roomId];
}

function assignPlayer(room, socketId) {
  if (!room.players.p1.socketId) { room.players.p1.socketId = socketId; return 'p1'; }
  if (!room.players.p2.socketId) { room.players.p2.socketId = socketId; return 'p2'; }
  return null;
}

function removePlayer(room, socketId) {
  for (const id of ['p1', 'p2']) {
    if (room.players[id].socketId === socketId) {
      room.players[id].socketId = null;
      room.players[id].input = { left: false, right: false, jump: false };
      return id;
    }
  }
  return null;
}

function connectedCount(room) {
  return (room.players.p1.socketId ? 1 : 0) + (room.players.p2.socketId ? 1 : 0);
}

// ─── Step 17: 3-second countdown before game starts ──────────────────────────

function startCountdown(room, roomId) {
  if (room.countdownTimer) {
    clearInterval(room.countdownTimer);
    room.countdownTimer = null;
  }

  let count = 3;
  room.status = 'countdown';
  room.state.status = 'countdown';
  room.state.countdown = count;
  room.state.winner = null;
  io.to(roomId).emit('gameState', room.state);

  room.countdownTimer = setInterval(() => {
    // Abort if room gone or player left
    if (!rooms[roomId] || connectedCount(rooms[roomId]) < 2) {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
      if (rooms[roomId]) {
        rooms[roomId].status = 'waiting';
        rooms[roomId].state.status = 'waiting';
        rooms[roomId].state.countdown = 0;
        io.to(roomId).emit('gameState', rooms[roomId].state);
      }
      return;
    }

    count--;

    if (count <= 0) {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
      room.status = 'playing';
      room.state.status = 'playing';
      room.state.countdown = 0;
      room.lastTime = Date.now();
    } else {
      room.state.countdown = count;
    }

    io.to(roomId).emit('gameState', room.state);
  }, 1000);
}

// ─── Physics ──────────────────────────────────────────────────────────────────

function updatePlayer(player, input, side, dt) {
  if (input.left) player.vx = -C.MOVE_SPEED;
  else if (input.right) player.vx = C.MOVE_SPEED;
  else player.vx = 0;

  if (input.jump && !player.isJumping) {
    player.vy = C.JUMP_FORCE;
    player.isJumping = true;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.vy += C.GRAVITY * dt;

  const floorY = C.FLOOR_Y - C.PLAYER_HEIGHT / 2;
  if (player.y >= floorY) {
    player.y = floorY;
    player.vy = 0;
    player.isJumping = false;
  }

  const hw = C.PLAYER_WIDTH / 2;
  const hn = C.NET_WIDTH / 2;
  if (side === 'p1') {
    player.x = Math.max(hw, Math.min(C.NET_X - hw - hn, player.x));
  } else {
    player.x = Math.max(C.NET_X + hw + hn, Math.min(C.GAME_WIDTH - hw, player.x));
  }
}

function updateBall(ball, dt) {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.vy += C.BALL_GRAVITY * dt;

  if (ball.x - C.BALL_RADIUS <= 0)             { ball.x = C.BALL_RADIUS; ball.vx = Math.abs(ball.vx); }
  if (ball.x + C.BALL_RADIUS >= C.GAME_WIDTH)  { ball.x = C.GAME_WIDTH - C.BALL_RADIUS; ball.vx = -Math.abs(ball.vx); }
  if (ball.y - C.BALL_RADIUS <= 0)             { ball.y = C.BALL_RADIUS; ball.vy = Math.abs(ball.vy); }

  // Floor: clamp only — scoring handled separately
  if (ball.y + C.BALL_RADIUS >= C.FLOOR_Y) ball.y = C.FLOOR_Y - C.BALL_RADIUS;

  checkNetCollision(ball);
}

function checkNetCollision(ball) {
  const netLeft = C.NET_X - C.NET_WIDTH / 2;
  const netRight = C.NET_X + C.NET_WIDTH / 2;
  const netTop = C.FLOOR_Y - C.NET_HEIGHT;

  const cx = Math.max(netLeft, Math.min(ball.x, netRight));
  const cy = Math.max(netTop, Math.min(ball.y, C.FLOOR_Y));
  const dx = ball.x - cx;
  const dy = ball.y - cy;

  if (dx * dx + dy * dy >= C.BALL_RADIUS * C.BALL_RADIUS) return;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (ball.x < C.NET_X) { ball.x = netLeft - C.BALL_RADIUS; ball.vx = -Math.abs(ball.vx); }
    else                   { ball.x = netRight + C.BALL_RADIUS; ball.vx = Math.abs(ball.vx); }
  } else {
    ball.y = netTop - C.BALL_RADIUS;
    ball.vy = -Math.abs(ball.vy);
  }
}

// Step 13: Ball-player collision
function checkPlayerCollision(ball, player) {
  const halfW = C.PLAYER_WIDTH / 2;
  const halfH = C.PLAYER_HEIGHT / 2;

  const cx = Math.max(player.x - halfW, Math.min(ball.x, player.x + halfW));
  const cy = Math.max(player.y - halfH, Math.min(ball.y, player.y + halfH));
  const dx = ball.x - cx;
  const dy = ball.y - cy;

  if (dx * dx + dy * dy >= C.BALL_RADIUS * C.BALL_RADIUS) return false;

  const penX = halfW + C.BALL_RADIUS - Math.abs(ball.x - player.x);
  const penY = halfH + C.BALL_RADIUS - Math.abs(ball.y - player.y);

  if (penX < penY) {
    if (ball.x < player.x) { ball.x = player.x - halfW - C.BALL_RADIUS; ball.vx = -Math.abs(ball.vx); }
    else                    { ball.x = player.x + halfW + C.BALL_RADIUS; ball.vx = Math.abs(ball.vx); }
    ball.vx += player.vx * 0.4;
  } else if (ball.y <= player.y) {
    ball.y = player.y - halfH - C.BALL_RADIUS;
    const jumpBonus = player.isJumping && player.vy < 0 ? -player.vy * 0.4 : 0;
    ball.vy = -(Math.abs(ball.vy) + jumpBonus + 3);
    ball.vx += player.vx * 0.5;
  } else {
    ball.y = player.y + halfH + C.BALL_RADIUS;
    ball.vy = Math.abs(ball.vy);
  }

  ball.vx = Math.max(-12, Math.min(12, ball.vx));
  ball.vy = Math.max(-15, Math.min(15, ball.vy));
  return true;
}

// Step 14: Scoring
function handleScoring(room, roomId) {
  const { state } = room;
  const ball = state.ball;

  if (ball.y + C.BALL_RADIUS < C.FLOOR_Y) return;

  const scorer = ball.x < C.NET_X ? 'p2' : 'p1';
  state.score[scorer]++;

  const serveVx = scorer === 'p1' ? 3 : -3;
  Object.assign(ball, { x: C.GAME_WIDTH / 2, y: 150, vx: serveVx, vy: -5, hitCooldown: 10 });

  const floorY = C.FLOOR_Y - C.PLAYER_HEIGHT / 2;
  Object.assign(state.players.p1, { x: 200, y: floorY, vx: 0, vy: 0, isJumping: false });
  Object.assign(state.players.p2, { x: 600, y: floorY, vx: 0, vy: 0, isJumping: false });

  if (state.score[scorer] >= C.WIN_SCORE) {
    state.winner = scorer;
    state.status = 'ended';
    room.status = 'ended';

    if (!room.restartScheduled) {
      room.restartScheduled = true;
      setTimeout(() => {
        if (!rooms[roomId] || rooms[roomId].status !== 'ended') return;
        const r = rooms[roomId];
        r.restartScheduled = false;
        r.state = createInitialState();
        if (connectedCount(r) === 2) startCountdown(r, roomId);
        else { r.status = 'waiting'; io.to(roomId).emit('gameState', r.state); }
      }, 5000);
    }
  }
}

// ─── Global game loop ─────────────────────────────────────────────────────────

setInterval(() => {
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.status !== 'playing') continue;

    const now = Date.now();
    const dt = Math.min((now - room.lastTime) / (1000 / C.TICK_RATE), 3);
    room.lastTime = now;

    const { state, players } = room;

    updatePlayer(state.players.p1, players.p1.input, 'p1', dt);
    updatePlayer(state.players.p2, players.p2.input, 'p2', dt);
    updateBall(state.ball, dt);

    if (state.ball.hitCooldown > 0) {
      state.ball.hitCooldown--;
    } else if (
      checkPlayerCollision(state.ball, state.players.p1) ||
      checkPlayerCollision(state.ball, state.players.p2)
    ) {
      state.ball.hitCooldown = 5;
    }

    handleScoring(room, roomId);

    io.to(roomId).emit('gameState', state);
  }
}, 1000 / C.TICK_RATE);

// ─── Socket events ────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('connected:', socket.id);
  let roomId = null;
  let playerId = null;

  socket.on('joinRoom', (rid) => {
    const room = getOrCreateRoom(rid);
    const assigned = assignPlayer(room, socket.id);

    if (!assigned) { socket.emit('roomFull'); return; }

    roomId = rid;
    playerId = assigned;
    socket.join(roomId);
    socket.emit('joined', { playerId, roomId });
    console.log(`${socket.id} → ${roomId} as ${playerId}`);

    // Send current state immediately so the new player sees the screen
    socket.emit('gameState', room.state);

    if (connectedCount(room) === 2) startCountdown(room, roomId);
  });

  socket.on('playerInput', (input) => {
    if (!roomId || !playerId) return;
    const room = rooms[roomId];
    if (room) room.players[playerId].input = input;
  });

  // Step 19: manual restart button
  socket.on('requestRestart', () => {
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room || room.status !== 'ended') return;

    room.restartScheduled = false;
    room.state = createInitialState();
    if (connectedCount(room) === 2) startCountdown(room, roomId);
    else { room.status = 'waiting'; io.to(roomId).emit('gameState', room.state); }
  });

  // Step 18: disconnection + room cleanup
  socket.on('disconnect', () => {
    console.log('disconnected:', socket.id);
    if (!roomId) return;

    const room = rooms[roomId];
    if (!room) return;

    // Cancel any running countdown
    if (room.countdownTimer) {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
    }

    const left = removePlayer(room, socket.id);
    if (left) {
      room.status = 'waiting';
      room.restartScheduled = false;
      room.state = createInitialState();
      console.log(`${roomId} reset — ${left} left`);

      if (connectedCount(room) === 0) {
        delete rooms[roomId]; // Step 18: empty room cleanup
        console.log(`Room ${roomId} deleted`);
      } else {
        io.to(roomId).emit('opponentLeft');
      }
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.send('OK'));

app.get(/.*/, (req, res) => {
  if (fs.existsSync(indexHtmlPath)) {
    return res.sendFile(indexHtmlPath);
  }

  if (req.path === '/') {
    return res.send('OK');
  }

  return res.status(404).send('Not Found');
});

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
