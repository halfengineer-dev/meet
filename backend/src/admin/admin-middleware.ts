import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../auth/middleware';
import { createRateLimiter } from '../auth/rate-limiter';
import { AdminContext, AdminPermission, hasPermission, resolveAdminContext } from './rbac';

export interface AdminRequest extends AuthenticatedRequest {
  adminContext?: AdminContext;
  correlationId?: string;
}

export function attachCorrelationId(req: AdminRequest, res: Response, next: NextFunction): void {
  const existing = req.headers['x-correlation-id'];
  const id = typeof existing === 'string' && existing.trim() ? existing.trim() : uuidv4();
  req.correlationId = id;
  res.setHeader('X-Correlation-Id', id);
  next();
}

export async function requireAdminAccess(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const ctx = await resolveAdminContext(req.user);
    if (!ctx) {
      res.status(403).json({ error: 'Administrator privileges required' });
      return;
    }

    req.adminContext = ctx;
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to resolve administrator permissions' });
  }
}

export function requirePermission(...required: AdminPermission[]) {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    const ctx = req.adminContext;
    if (!ctx) {
      res.status(403).json({ error: 'Administrator privileges required' });
      return;
    }

    for (const perm of required) {
      if (!hasPermission(ctx, perm)) {
        res.status(403).json({
          error: `Forbidden: Missing required administrator permission (${perm})`,
          code: 'INSUFFICIENT_ADMIN_PERMISSION',
          requiredPermission: perm,
        });
        return;
      }
    }

    next();
  };
}

export function requirePlatformAdminOnly(req: AdminRequest, res: Response, next: NextFunction): void {
  const ctx = req.adminContext;
  if (!ctx || !ctx.isPlatformAdmin) {
    res.status(403).json({
      error: 'Forbidden: Platform administrator privileges required',
      code: 'PLATFORM_ADMIN_REQUIRED',
    });
    return;
  }
  next();
}

export const adminSensitiveActionLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADMIN_SENSITIVE_RATE_LIMIT || 120),
  message: 'Too many sensitive administrative requests. Please slow down and try again later.',
});

