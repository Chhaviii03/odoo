import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(userId: string) {
  if (socket) return socket;
  socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] });
  socket.on('connect', () => socket?.emit('subscribe', userId));
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
