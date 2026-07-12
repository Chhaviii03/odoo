import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { orgService } from './org.service.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  statusSchema,
  createCategorySchema,
  updateCategorySchema,
  updateRoleSchema,
  updateEmployeeSchema,
} from './org.validation.js';

export const departmentsRouter = Router();
export const categoriesRouter = Router();
export const employeesRouter = Router();

// ---- Departments (Admin) ----
departmentsRouter.use(requireAuth);
departmentsRouter.get('/', asyncHandler(async (_req, res) => res.json(await orgService.listDepartments())));
departmentsRouter.post('/', requireRole('ADMIN'), validate(createDepartmentSchema), asyncHandler(async (req, res) => res.status(201).json(await orgService.createDepartment(req.body, req.user!.sub))));
// `/status` must be registered before `/:id` so it is not swallowed by the generic patch.
departmentsRouter.patch('/:id/status', requireRole('ADMIN'), validate(statusSchema), asyncHandler(async (req, res) => res.json(await orgService.setDepartmentStatus(req.params.id, req.body.status, req.user!.sub))));
departmentsRouter.patch('/:id', requireRole('ADMIN'), validate(updateDepartmentSchema), asyncHandler(async (req, res) => res.json(await orgService.updateDepartment(req.params.id, req.body, req.user!.sub))));

// ---- Categories (Admin) ----
categoriesRouter.use(requireAuth);
categoriesRouter.get('/', asyncHandler(async (_req, res) => res.json(await orgService.listCategories())));
categoriesRouter.post('/', requireRole('ADMIN'), validate(createCategorySchema), asyncHandler(async (req, res) => res.status(201).json(await orgService.createCategory(req.body, req.user!.sub))));
categoriesRouter.patch('/:id', requireRole('ADMIN'), validate(updateCategorySchema), asyncHandler(async (req, res) => res.json(await orgService.updateCategory(req.params.id, req.body, req.user!.sub))));

// ---- Employees ----
employeesRouter.use(requireAuth);
employeesRouter.get('/', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => res.json(await orgService.listEmployees(req.query.search as string | undefined))));
employeesRouter.get('/for-allocation', requireRole('ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'), asyncHandler(async (req, res) => {
  const actor = { id: req.user!.sub, role: req.user!.role, departmentId: req.user!.departmentId };
  res.json(await orgService.listEmployeesForAllocation(actor, req.query.search as string | undefined));
}));
employeesRouter.patch('/:id', requireRole('ADMIN'), validate(updateEmployeeSchema), asyncHandler(async (req, res) => res.json(await orgService.updateEmployee(req.params.id, req.body, req.user!.sub))));
employeesRouter.patch('/:id/role', requireRole('ADMIN'), validate(updateRoleSchema), asyncHandler(async (req, res) => res.json(await orgService.updateRole(req.params.id, req.body.role, req.user!.sub))));
employeesRouter.patch('/:id/status', requireRole('ADMIN'), validate(statusSchema), asyncHandler(async (req, res) => res.json(await orgService.setEmployeeStatus(req.params.id, req.body.status, req.user!.sub))));
