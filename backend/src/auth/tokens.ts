import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { UserRecord } from '../db/types';

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'faceonn-dev-access-secret-32-chars-minimum-key';
const JITSI_JWT_SECRET = process.env.JWT_APP_SECRET || process.env.JITSI_APP_SECRET || 'faceonn-dev-jitsi-secret-key-12345';
const JITSI_APP_ID = process.env.JWT_APP_ID || 'faceonn';
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'faceonn.com';

const ACCESS_TOKEN_EXPIRATION = '15m'; // 15 minutes
export const REFRESH_TOKEN_EXPIRATION_DAYS = 7;

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string | null;
  type: 'access';
  iat?: number;
  exp?: number;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateAccessToken(user: { id: string; email: string; name: string | null }): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    type: 'access',
  };

  return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRATION,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as AccessTokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

export function generateJitsiMeetingToken(params: {
  user: { id: string; name: string | null; email: string; avatar_url?: string | null };
  room: string;
  isModerator: boolean;
}): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);

  const payload = {
    iss: JITSI_APP_ID,
    aud: JITSI_APP_ID,
    sub: PUBLIC_DOMAIN,
    room: params.room.toLowerCase().trim(),
    context: {
      user: {
        id: params.user.id,
        name: params.user.name || 'Faceonn User',
        email: params.user.email,
        avatar: params.user.avatar_url || undefined,
        moderator: Boolean(params.isModerator),
      },
      features: {
        recording: true,
        livestreaming: true,
        transcription: true,
      },
    },
    nbf: nowInSeconds - 10,
    exp: nowInSeconds + 7200, // 2 hours
  };

  return jwt.sign(payload, JITSI_JWT_SECRET, {
    algorithm: 'HS256',
  });
}

