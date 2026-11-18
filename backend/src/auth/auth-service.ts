import crypto from 'crypto';
import { userRepository } from '../db/repositories/user-repository';
import { sessionRepository } from '../db/repositories/session-repository';
import { adminStore } from '../db/repositories/admin-store';
import { PlatformAdminRole, UserRecord, UserRole, SessionRecord } from '../db/types';
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
  role: UserRole;
  adminRole?: PlatformAdminRole | null;
  organizationId?: string | null;
  country?: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  lastActiveAt?: string | null;
}

export function toSafeUser(user: UserRecord): SafeUser {
  const role: UserRole = user.role === 'admin' ? 'admin' : 'user';
  const adminRole: PlatformAdminRole | null = user.admin_role ?? (role === 'admin' ? 'super_admin' : null);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_url,
    emailVerified: user.email_verified,
    role,
    adminRole,
    organizationId: user.organization_id || null,
    country: user.country || null,
    status: user.status,
    createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : new Date(user.created_at).toISOString(),
    lastLoginAt: user.last_login_at
      ? (user.last_login_at instanceof Date ? user.last_login_at.toISOString() : new Date(user.last_login_at).toISOString())
      : null,
    lastActiveAt: user.last_active_at
      ? (user.last_active_at instanceof Date ? user.last_active_at.toISOString() : new Date(user.last_active_at).toISOString())
      : null,
  };
}

function generateTemporaryPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;

  const chars = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];

  for (let i = chars.length; i < length; i++) {
    chars.push(all[crypto.randomInt(all.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
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
      await adminStore.insertSecurityEvent({
        event_type: 'login_failed',
        severity: 'low',
        user_id: null,
        email: normalizedEmail,
        ip_address: meta.ipAddress || null,
        user_agent: meta.userAgent || null,
        country: null,
        metadata: { reason: 'user_not_found' },
      }).catch(() => {});
      throw new Error('Invalid email or password');
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      await adminStore.insertSecurityEvent({
        event_type: 'login_failed',
        severity: 'medium',
        user_id: user.id,
        email: normalizedEmail,
        ip_address: meta.ipAddress || null,
        user_agent: meta.userAgent || null,
        country: user.country || null,
        metadata: { reason: 'invalid_password' },
      }).catch(() => {});
      throw new Error('Invalid email or password');
    }

    if (user.status !== 'active') {
      await adminStore.insertSecurityEvent({
        event_type: 'login_blocked_disabled',
        severity: 'medium',
        user_id: user.id,
        email: normalizedEmail,
        ip_address: meta.ipAddress || null,
        user_agent: meta.userAgent || null,
        country: user.country || null,
        metadata: { status: user.status },
      }).catch(() => {});
      throw new Error('Your account is currently disabled. Please contact support.');
    }

    // Detect new device / user agent
    const prevSessions = await sessionRepository.listUserSessions(user.id);
    const isNewDevice = Boolean(
      meta.userAgent && prevSessions.length > 0 && !prevSessions.some((s) => s.user_agent === meta.userAgent)
    );

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

    await adminStore.insertSecurityEvent({
      event_type: isNewDevice ? 'new_device_login' : 'login_success',
      severity: isNewDevice ? 'low' : 'info',
      user_id: user.id,
      email: user.email,
      ip_address: meta.ipAddress || null,
      user_agent: meta.userAgent || null,
      country: user.country || null,
      metadata: { isNewDevice },
    }).catch(() => {});

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
      await adminStore.insertSecurityEvent({
        event_type: 'token_reuse',
        severity: 'high',
        user_id: session.user_id,
        email: null,
        ip_address: meta.ipAddress || null,
        user_agent: meta.userAgent || null,
        country: null,
        metadata: { familyId: session.family_id, sessionId: session.id },
      }).catch(() => {});
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

  public async onboardUserByAdmin(params: {
    name: string;
    email: string;
    password?: string;
    role?: UserRole;
  }): Promise<{ user: SafeUser; temporaryPassword?: string }> {
    const trimmedName = (params.name || '').trim();
    if (!trimmedName) {
      throw new Error('Participant name is required');
    }

    if (!this.validateEmail(params.email)) {
      throw new Error('Please provide a valid email address');
    }

    const normalizedEmail = params.email.trim().toLowerCase();
    const existing = await userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new Error('An account with this email address already exists');
    }

    let finalPassword = (params.password || '').trim();
    let temporaryPassword: string | undefined;

    if (finalPassword) {
      const policy = validatePasswordPolicy(finalPassword);
      if (!policy.valid) {
        throw new Error(policy.message || 'Password does not meet security requirements');
      }
    } else {
      finalPassword = generateTemporaryPassword(12);
      temporaryPassword = finalPassword;
    }

    const role: UserRole = params.role === 'admin' ? 'admin' : 'user';
    const password_hash = await hashPassword(finalPassword);

    const user = await userRepository.createUser({
      name: trimmedName,
      email: normalizedEmail,
      password_hash,
      role,
      email_verified: true,
      status: 'active',
    });

    return {
      user: toSafeUser(user),
      ...(temporaryPassword ? { temporaryPassword } : {}),
    };
  }

  public async listAllUsersForAdmin(search?: string): Promise<SafeUser[]> {
    const users = await userRepository.listUsers(search);
    return users.map(toSafeUser);
  }

  public async updateUserByAdmin(
    actorId: string,
    targetUserId: string,
    updates: {
      name?: string;
      role?: UserRole;
      status?: 'active' | 'suspended' | 'deactivated';
      password?: string;
      generatePassword?: boolean;
    }
  ): Promise<{ user: SafeUser; temporaryPassword?: string }> {
    const target = await userRepository.findById(targetUserId);
    if (!target) {
      throw new Error('User not found');
    }

    if (actorId === targetUserId) {
      if (updates.role && updates.role !== 'admin') {
        throw new Error('You cannot remove your own administrator role');
      }
      if (updates.status && updates.status !== 'active') {
        throw new Error('You cannot deactivate your own account');
      }
    }

    let password_hash: string | undefined;
    let temporaryPassword: string | undefined;

    if (updates.generatePassword) {
      temporaryPassword = generateTemporaryPassword(12);
      password_hash = await hashPassword(temporaryPassword);
    } else if (updates.password && updates.password.trim()) {
      const policy = validatePasswordPolicy(updates.password.trim());
      if (!policy.valid) {
        throw new Error(policy.message || 'Password does not meet security requirements');
      }
      password_hash = await hashPassword(updates.password.trim());
    }

    const updated = await userRepository.updateUser(targetUserId, {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.role !== undefined ? { role: updates.role } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(password_hash ? { password_hash } : {}),
    });

    if (!updated) {
      throw new Error('Failed to update user');
    }

    if (updates.status && updates.status !== 'active') {
      await sessionRepository.revokeAllUserSessions(targetUserId);
    }

    return {
      user: toSafeUser(updated),
      ...(temporaryPassword ? { temporaryPassword } : {}),
    };
  }

  public async deleteUserByAdmin(actorId: string, targetUserId: string): Promise<void> {
    if (actorId === targetUserId) {
      throw new Error('You cannot delete your own account');
    }

    const target = await userRepository.findById(targetUserId);
    if (!target) {
      throw new Error('User not found');
    }

    await sessionRepository.revokeAllUserSessions(targetUserId);
    await userRepository.deleteUser(targetUserId);
  }

  public async ensureBootstrapAdmin(): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();
    const adminName = process.env.ADMIN_NAME?.trim() || 'Administrator';

    if (adminEmail) {
      const existing = await userRepository.findByEmail(adminEmail);
      if (existing) {
        if (existing.role !== 'admin') {
          await userRepository.updateUser(existing.id, { role: 'admin', status: 'active' });
          console.log(`👑 [Auth] Promoted configured ADMIN_EMAIL (${adminEmail}) to admin.`);
        }
        return;
      }

      if (adminPassword) {
        const policy = validatePasswordPolicy(adminPassword);
        if (!policy.valid) {
          console.warn(`⚠️ [Auth] ADMIN_PASSWORD does not meet password policy: ${policy.message}`);
          return;
        }
        const password_hash = await hashPassword(adminPassword);
        await userRepository.createUser({
          name: adminName,
          email: adminEmail,
          password_hash,
          role: 'admin',
          email_verified: true,
          status: 'active',
        });
        console.log(`👑 [Auth] Bootstrapped initial admin account (${adminEmail}).`);
        return;
      }
    }

    // Ensure existing deployments with users never get locked out when public signup is disabled
    const adminCount = await userRepository.countByRole('admin');
    if (adminCount === 0) {
      const earliest = await userRepository.findEarliestUser();
      if (earliest) {
        await userRepository.updateUser(earliest.id, { role: 'admin' });
        console.log(`👑 [Auth] Promoted earliest existing user (${earliest.email}) to admin.`);
      } else {
        console.log('ℹ️ [Auth] No users exist yet. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to bootstrap an admin account.');
      }
    }
  }
}

export const authService = new AuthService();

