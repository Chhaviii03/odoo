import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { env } from '../config/env.js';

let io: SocketServer | null = null;

export function initSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: env.corsOrigin, credentials: true },
  });

  io.on('connection', (socket) => {
    // Clients join a room named after their user id to receive targeted notifications.
    socket.on('subscribe', (userId: string) => {
      if (userId) socket.join(`user:${userId}`);
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function broadcast(event: string, payload: unknown): void {
  io?.emit(event, payload);
}
