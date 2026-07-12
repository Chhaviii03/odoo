import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { bookingsService } from './bookings.service.js';
import { createBookingSchema, rescheduleSchema } from './bookings.validation.js';

export const bookingsRouter = Router();

bookingsRouter.use(requireAuth);
bookingsRouter.get('/mine', asyncHandler(async (req, res) => res.json(await bookingsService.listMine(req.user!.sub))));
bookingsRouter.post('/', validate(createBookingSchema), asyncHandler(async (req, res) => res.status(201).json(await bookingsService.create(req.body, req.user!.sub))));
bookingsRouter.patch('/:id/cancel', asyncHandler(async (req, res) => res.json(await bookingsService.cancel(req.params.id, { id: req.user!.sub, role: req.user!.role }))));
bookingsRouter.patch('/:id/reschedule', validate(rescheduleSchema), asyncHandler(async (req, res) => res.json(await bookingsService.reschedule(req.params.id, req.body, { id: req.user!.sub, role: req.user!.role }))));
