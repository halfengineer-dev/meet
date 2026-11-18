import { Router, Response } from 'express';
import { authService } from '../auth/auth-service';
import { AuthenticatedRequest, requireAdmin, requireAuth } from '../auth/middleware';
import { UserRole } from '../db/types';

export const adminRouter = Router();

// Every route under /api/admin requires an authenticated administrator
adminRouter.use(requireAuth, requireAdmin);

// GET /api/admin/users — list all onboarded users
adminRouter.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const users = await authService.listAllUsersForAdmin(search);
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list users' });
  }
});

// POST /api/admin/users — onboard a new participant (or admin)
adminRouter.post('/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, password, role } = req.body || {};
    const normalizedRole: UserRole = role === 'admin' ? 'admin' : 'user';

    const result = await authService.onboardUserByAdmin({
      name,
      email,
      password,
      role: normalizedRole,
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to onboard participant' });
  }
});

// PATCH /api/admin/users/:id — update participant role, status, name, or reset password
adminRouter.patch('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, role, status, password, generatePassword } = req.body || {};

    if (role !== undefined && role !== 'admin' && role !== 'user') {
      res.status(400).json({ error: 'Invalid role. Must be "admin" or "user".' });
      return;
    }

    if (status !== undefined && status !== 'active' && status !== 'suspended' && status !== 'deactivated') {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }

    const result = await authService.updateUserByAdmin(req.user.id, userId, {
      name,
      role,
      status,
      password,
      generatePassword: Boolean(generatePassword),
    });

    res.json(result);
  } catch (err: any) {
    const statusCode = /not found/i.test(err.message) ? 404 : 400;
    res.status(statusCode).json({ error: err.message || 'Failed to update user' });
  }
});

// DELETE /api/admin/users/:id — remove a participant account
adminRouter.delete('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await authService.deleteUserByAdmin(req.user.id, userId);
    res.json({ success: true });
  } catch (err: any) {
    const statusCode = /not found/i.test(err.message) ? 404 : 400;
    res.status(statusCode).json({ error: err.message || 'Failed to delete user' });
  }
});

