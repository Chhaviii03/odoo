import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { departmentsRouter, categoriesRouter, employeesRouter } from './modules/org/org.routes.js';
import { assetsRouter } from './modules/assets/assets.routes.js';
import { allocationsRouter, transfersRouter } from './modules/allocations/allocations.routes.js';
import { bookingsRouter } from './modules/bookings/bookings.routes.js';
import { maintenanceRouter } from './modules/maintenance/maintenance.routes.js';
import { auditCyclesRouter, auditItemsRouter } from './modules/audits/audits.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { notificationsRouter, activityLogsRouter } from './modules/notifications/notifications.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/uploads', express.static(path.resolve(process.cwd(), env.uploadDir)));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'assetflow-api' }));

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use('/departments', departmentsRouter);
  api.use('/categories', categoriesRouter);
  api.use('/employees', employeesRouter);
  api.use('/assets', assetsRouter);
  api.use('/allocations', allocationsRouter);
  api.use('/transfers', transfersRouter);
  api.use('/bookings', bookingsRouter);
  api.use('/maintenance-requests', maintenanceRouter);
  api.use('/audit-cycles', auditCyclesRouter);
  api.use('/audit-items', auditItemsRouter);
  api.use('/reports', reportsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/activity-logs', activityLogsRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/uploads', uploadsRouter);

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
