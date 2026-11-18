import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './tokens';
import { userRepository } from '../db/repositories/user-repository';
import { UserRecord } from '../db/types';

export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7).trim();
  try {
    const payload = verifyAccessToken(token);
    const user = await userRepository.findById(payload.sub);

    if (!user || user.status !== 'active') {
      res.status(401).json({ error: 'User account not found or disabled' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required' });
    return;
  }

  next();
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    try {
      const payload = verifyAccessToken(token);
      const user = await userRepository.findById(payload.sub);
      if (user && user.status === 'active') {
        req.user = user;
      }
    } catch (_) {
      // Ignore errors for optional authentication
    }
  }
  next();
}

