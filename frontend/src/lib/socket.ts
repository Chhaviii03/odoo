import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let subscribedUserId: string | null = null;

export function connectSocket(userId: string) {
  if (socket && subscribedUserId === userId) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  // Always tear down when the logged-in user changes so we don't keep
  // receiving another person's notification room.
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  subscribedUserId = userId;
  socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] });
  const subscribe = () => socket?.emit('subscribe', userId);
  socket.on('connect', subscribe);
  if (socket.connected) subscribe();
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  subscribedUserId = null;
}
