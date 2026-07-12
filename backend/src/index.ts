import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { initSocket } from './lib/socket.js';
import { startCron } from './lib/cron.js';

const app = createApp();
const server = createServer(app);

initSocket(server);
startCron();

server.listen(env.port, () => {
  console.log(`AssetFlow API listening on http://localhost:${env.port}`);
  console.log(`Health check: http://localhost:${env.port}/health`);
});

