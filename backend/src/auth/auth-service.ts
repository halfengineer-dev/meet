import { userRepository } from '../db/repositories/user-repository';
import { sessionRepository } from '../db/repositories/session-repository';
import { UserRecord, SessionRecord } from '../db/types';
import { hashPassword, verifyPassword, validatePasswordPolicy } from './password';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_EXPIRATION_DAYS,
} from './tokens';

export interface ClientMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface SafeUser {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_url,
    emailVerified: user.email_verified,
    status: user.status,
    createdAt: user.created_at.toISOString(),
    lastLoginAt: user.last_login_at ? user.last_login_at.toISOString() : null,
  };
}

export class AuthService {
  private validateEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    // Standard RFC 5322 regex approximation
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(email.trim());
  }

  public async register(
    name: string | null,
    email: string,
    password: string,
    meta: ClientMeta = {}
  ): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
    if (!this.validateEmail(email)) {
      throw new Error('Please provide a valid email address');
    }

    const policy = validatePasswordPolicy(password);
    if (!policy.valid) {
      throw new Error(policy.message || 'Password does not meet security requirements');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new Error('An account with this email address already exists');
    }

    const password_hash = await hashPassword(password);
    const user = await userRepository.createUser({
      name: name ? name.trim() : null,
      email: normalizedEmail,
      password_hash,
    });

    // Establish authenticated session immediately
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    await sessionRepository.createSession({
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      expires_at: expiresAt,
      user_agent: meta.userAgent,
      ip_address: meta.ipAddress,
    });

    await userRepository.updateLastLogin(user.id);
    const accessToken = generateAccessToken(user);

    return {
      user: toSafeUser(user),
      accessToken,
      refreshToken,
    };
  }

  public async login(
    email: string,
    password: string,
    meta: ClientMeta = {}
  ): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepository.findByEmail(normalizedEmail);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new Error('Your account is currently disabled. Please contact support.');
    }

    // Create session
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    await sessionRepository.createSession({
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      expires_at: expiresAt,
      user_agent: meta.userAgent,
      ip_address: meta.ipAddress,
    });

    await userRepository.updateLastLogin(user.id);
    user.last_login_at = new Date();

    const accessToken = generateAccessToken(user);

    return {
      user: toSafeUser(user),
      accessToken,
      refreshToken,
    };
  }

  public async refresh(
    refreshToken: string,
    meta: ClientMeta = {}
  ): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    const tokenHash = hashToken(refreshToken);
    const session = await sessionRepository.findByTokenHash(tokenHash);

    if (!session) {
      throw new Error('Invalid refresh token');
    }

    // Check if session has been revoked - Token Reuse Detection!
    if (session.revoked_at) {
      console.warn(`[Security Alert] Revoked refresh token reused! Revoking family: ${session.family_id}`);
      await sessionRepository.revokeFamily(session.family_id);
      throw new Error('Refresh token reuse detected. Session terminated for security.');
    }

    // Check expiration
    if (new Date() > new Date(session.expires_at)) {
      await sessionRepository.revokeSession(session.id);
      throw new Error('Session has expired. Please log in again.');
    }

    const user = await userRepository.findById(session.user_id);
    if (!user || user.status !== 'active') {
      await sessionRepository.revokeSession(session.id);
      throw new Error('User account not found or disabled');
    }

    // Refresh Token Rotation
    const newRefreshToken = generateRefreshToken();
    const newTokenHash = hashToken(newRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    await sessionRepository.rotateRefreshToken(session.id, newTokenHash, newExpiresAt);
    const accessToken = generateAccessToken(user);

    return {
      user: toSafeUser(user),
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  public async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      const session = await sessionRepository.findByTokenHash(tokenHash);
      if (session) {
        await sessionRepository.revokeSession(session.id);
      }
    }
  }

  public async listUserSessions(userId: string): Promise<SessionRecord[]> {
    return sessionRepository.listUserSessions(userId);
  }

  public async revokeUserSession(userId: string, sessionId: string): Promise<void> {
    const session = await sessionRepository.findById(sessionId);
    if (session && session.user_id === userId) {
      await sessionRepository.revokeSession(sessionId);
    }
  }
}

export const authService = new AuthService();

