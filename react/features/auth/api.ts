import { API_BASE_URL } from './constants';
import { IUser, IMeeting, IMeetingSession } from './types';

interface AuthResponse {
    user: IUser;
    accessToken: string;
}

export class AuthApiClient {
    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${API_BASE_URL}${endpoint}`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {})
        };

        const config: RequestInit = {
            ...options,
            headers,
            credentials: 'include' // Delivers HttpOnly refresh cookie across requests
        };

        const res = await fetch(url, config);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || `Request failed with status ${res.status}`);
        }

        return data as T;
    }

    public async register(payload: { name?: string; email: string; password: string }): Promise<AuthResponse> {
        return this.request<AuthResponse>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public async login(payload: { email: string; password: string }): Promise<AuthResponse> {
        return this.request<AuthResponse>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public async refresh(): Promise<AuthResponse> {
        return this.request<AuthResponse>('/api/auth/refresh', {
            method: 'POST'
        });
    }

    public async logout(): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>('/api/auth/logout', {
            method: 'POST'
        });
    }

    public async getMe(accessToken: string): Promise<{ user: IUser }> {
        return this.request<{ user: IUser }>('/api/auth/me', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async getMeetings(accessToken: string): Promise<{ meetings: IMeeting[] }> {
        return this.request<{ meetings: IMeeting[] }>('/api/meetings', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async createMeeting(title?: string, accessToken?: string): Promise<{
        meeting: { id: string; roomId: string; title: string; ownerId: string; status: string; createdAt: string };
        token: string;
        role: 'owner' | 'moderator' | 'participant';
    }> {
        return this.request('/api/meetings', {
            method: 'POST',
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
            body: JSON.stringify({ title })
        });
    }

    public async getMeetingToken(roomId: string, accessToken: string): Promise<{
        meeting: { id: string; roomId: string; title: string; ownerId: string; status: string; createdAt: string };
        token: string;
        role: 'owner' | 'moderator' | 'participant';
    }> {
        return this.request(`/api/meetings/${encodeURIComponent(roomId)}/token`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }
}

export const authApiClient = new AuthApiClient();

