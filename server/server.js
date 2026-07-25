import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createFountainSim } from '../shared/fountainSim.js';

const app = express();
app.use(cors());

app.get('/health', (req, res) => {
  res.send({ status: 'ok' });
});

// Game UI is the Vite client (dev: :5181). Socket server alone has no page at /.
app.get('/', (req, res) => {
  res.redirect(302, 'http://localhost:5181/');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const sim = createFountainSim({
  onEmit(event, data, toPlayerId) {
    if (toPlayerId) io.to(toPlayerId).emit(event, data);
    else io.emit(event, data);
  },
});

const clientEvents = [
  'joinGame',
  'changeMap',
  'movePlayer',
  'pokeBoat',
  'lassoBoat',
  'steerBoat',
  'respawnBoat',
  'startCourse',
  'abandonCourse',
  'leaveGame',
  'devGetSettings',
  'devSetSettings',
  'devResetSettings',
];

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  sim.connect(socket.id);

  for (const event of clientEvents) {
    socket.on(event, (data) => sim.handle(socket.id, event, data));
  }

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    sim.disconnect(socket.id);
  });
});

sim.start();

const PORT = process.env.PORT || 3005;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
