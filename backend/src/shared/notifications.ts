import { prisma } from '../lib/prisma.js';
import { emitToUser } from '../lib/socket.js';

interface NotifyInput {
  userId: string;
  type: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function notify(input: NotifyInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      message: input.message,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    },
  });
  emitToUser(input.userId, 'notification', notification);
  return notification;
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>) {
  await Promise.all([...new Set(userIds)].map((userId) => notify({ ...input, userId })));
}
