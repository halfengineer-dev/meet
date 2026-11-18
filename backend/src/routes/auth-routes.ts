import { Router, Response } from 'express';
import { authService, toSafeUser } from '../auth/auth-service';
import { resolveAdminContext } from '../admin/rbac';
import { requireAuth, AuthenticatedRequest } from '../auth/middleware';
import { createRateLimiter } from '../auth/rate-limiter';
import { REFRESH_TOKEN_EXPIRATION_DAYS } from '../auth/tokens';

export const authRouter = Router();

const REFRESH_COOKIE_NAME = 'faceonn_refresh_token';

function setRefreshCookie(res: Response, refreshToken: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });
}

// Rate limiters: 20 login attempts per 15 mins, 10 register attempts per 15 mins
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts. Please try again later.',
});

const registerLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many account creation attempts. Please try again later.',
});

// POST /api/auth/register — Public self-registration is disabled; admins onboard participants via /api/admin/users
authRouter.post('/register', registerLimiter, (_req, res) => {
  res.status(403).json({
    error: 'Public sign up is disabled. Please contact an administrator to be onboarded.',
    code: 'SIGNUP_DISABLED',
  });
});

// POST /api/auth/login
authRouter.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const meta = {
      userAgent: req.headers['user-agent'] || null,
      ipAddress: (req.ip || req.socket.remoteAddress || null) as string | null,
    };

    const { user, accessToken, refreshToken } = await authService.login(email, password, meta);

    setRefreshCookie(res, refreshToken);
    res.json({
      user,
      accessToken,
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Invalid email or password' });
  }
});

// POST /api/auth/refresh
authRouter.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token provided' });
      return;
    }

    const meta = {
      userAgent: req.headers['user-agent'] || null,
      ipAddress: (req.ip || req.socket.remoteAddress || null) as string | null,
    };

    const { user, accessToken, refreshToken: newRefreshToken } = await authService.refresh(
      refreshToken,
      meta
    );

    setRefreshCookie(res, newRefreshToken);
    res.json({
      user,
      accessToken,
    });
  } catch (err: any) {
    clearRefreshCookie(res);
    res.status(401).json({ error: err.message || 'Failed to refresh session' });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
  } catch (_) {
    // Ignore error on logout
  } finally {
    clearRefreshCookie(res);
    res.json({ success: true, message: 'Logged out successfully' });
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const adminCtx = await resolveAdminContext(req.user);
  res.json({
    user: {
      ...toSafeUser(req.user),
      isAdmin: Boolean(adminCtx),
      adminScope: adminCtx ? (adminCtx.isPlatformAdmin ? 'platform' : 'organization') : null,
      platformRole: adminCtx?.platformRole || null,
      orgRole: adminCtx?.orgRole || null,
      scopedOrganizationId: adminCtx?.scopedOrganizationId || null,
      permissions: adminCtx ? Array.from(adminCtx.permissions) : [],
    },
  });
});

// GET /api/auth/sessions
authRouter.get('/sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const sessions = await authService.listUserSessions(req.user.id);
  res.json({
    sessions: sessions.map(s => ({
      id: s.id,
      createdAt: s.created_at,
      lastUsedAt: s.last_used_at,
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      expiresAt: s.expires_at,
    })),
  });
});

// DELETE /api/auth/sessions/:id
authRouter.delete('/sessions/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await authService.revokeUserSession(req.user.id, sessionId);
  res.json({ success: true });
});
