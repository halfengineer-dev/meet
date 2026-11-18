import { API_BASE_URL } from './constants';
import {
    IUser,
    IMeeting,
    IMeetingOccurrence,
    IMeetingSessionInfo,
    IScheduleMeetingDTO,
    IUpdateMeetingDTO,
    IScheduleMeetingResponse,
    IMeetingDetailsResponse,
    IMeetingInvitation,
    IPublicMeetingInfo
} from './types';

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
            const error: any = new Error(data.error || `Request failed with status ${res.status}`);
            error.status = res.status;
            error.code = data.code;
            throw error;
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

    public async adminListUsers(
        accessToken: string,
        search?: string
    ): Promise<{ users: IUser[] }> {
        const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
        return this.request<{ users: IUser[] }>(`/api/admin/users${query}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async adminOnboardUser(
        payload: { name: string; email: string; password?: string; role?: 'admin' | 'user' },
        accessToken: string
    ): Promise<{ user: IUser; temporaryPassword?: string }> {
        return this.request<{ user: IUser; temporaryPassword?: string }>('/api/admin/users', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        });
    }

    public async adminUpdateUser(
        userId: string,
        payload: {
            name?: string;
            role?: 'admin' | 'user';
            status?: 'active' | 'deactivated' | 'suspended';
            password?: string;
            generatePassword?: boolean;
        },
        accessToken: string
    ): Promise<{ user: IUser; temporaryPassword?: string }> {
        return this.request<{ user: IUser; temporaryPassword?: string }>(
            `/api/admin/users/${encodeURIComponent(userId)}`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${accessToken}`
                },
                body: JSON.stringify(payload)
            }
        );
    }

    public async adminDeleteUser(
        userId: string,
        accessToken: string
    ): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
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

    public async getUpcomingMeetings(accessToken: string): Promise<{ meetings: IMeeting[] }> {
        return this.request<{ meetings: IMeeting[] }>('/api/meetings/upcoming', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async getPastMeetings(accessToken: string): Promise<{ meetings: IMeeting[] }> {
        return this.request<{ meetings: IMeeting[] }>('/api/meetings/past', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async createMeeting(title?: string, accessToken?: string): Promise<{
        meeting: IMeeting;
        token: string;
        role: 'owner' | 'moderator' | 'participant';
    }> {
        return this.request('/api/meetings', {
            method: 'POST',
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
            body: JSON.stringify({ title })
        });
    }

    public async scheduleMeeting(
        payload: IScheduleMeetingDTO,
        accessToken: string
    ): Promise<IScheduleMeetingResponse> {
        return this.request<IScheduleMeetingResponse>('/api/meetings/schedule', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        });
    }

    public async getMeetingDetails(
        meetingId: string,
        accessToken: string
    ): Promise<IMeetingDetailsResponse> {
        return this.request<IMeetingDetailsResponse>(`/api/meetings/${encodeURIComponent(meetingId)}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async updateMeeting(
        meetingId: string,
        payload: IUpdateMeetingDTO,
        accessToken: string
    ): Promise<{ meeting: IMeeting }> {
        return this.request<{ meeting: IMeeting }>(`/api/meetings/${encodeURIComponent(meetingId)}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        });
    }

    public async cancelMeeting(
        meetingId: string,
        accessToken: string,
        scope: 'occurrence' | 'series' = 'occurrence'
    ): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/api/meetings/${encodeURIComponent(meetingId)}/cancel`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({ scope })
        });
    }

    public async startMeeting(
        meetingId: string,
        accessToken: string,
        occurrenceId?: string
    ): Promise<{
        meeting: IMeeting;
        occurrence?: IMeetingOccurrence;
        session?: IMeetingSessionInfo;
        token: string;
        role?: 'owner' | 'moderator';
    }> {
        const endpoint = occurrenceId
            ? `/api/meetings/${encodeURIComponent(meetingId)}/occurrences/${encodeURIComponent(occurrenceId)}/start`
            : `/api/meetings/${encodeURIComponent(meetingId)}/start`;
        return this.request(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: occurrenceId ? JSON.stringify({ occurrenceId }) : undefined
        });
    }

    public async getOccurrences(
        meetingId: string,
        accessToken: string
    ): Promise<{ occurrences: IMeetingOccurrence[] }> {
        return this.request(`/api/meetings/${encodeURIComponent(meetingId)}/occurrences`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async cancelOccurrence(
        meetingId: string,
        occurrenceId: string,
        accessToken: string
    ): Promise<{ occurrence: IMeetingOccurrence }> {
        return this.request(
            `/api/meetings/${encodeURIComponent(meetingId)}/occurrences/${encodeURIComponent(occurrenceId)}/cancel`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
    }

    public async endOccurrence(
        meetingId: string,
        accessToken: string,
        occurrenceId?: string
    ): Promise<{
        meeting: IMeeting;
        endedOccurrence: IMeetingOccurrence | null;
        nextOccurrence: IMeetingOccurrence | null;
    }> {
        return this.request(`/api/meetings/${encodeURIComponent(meetingId)}/end-occurrence`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify(occurrenceId ? { occurrenceId } : {})
        });
    }

    public async endSeries(
        meetingId: string,
        accessToken: string
    ): Promise<{ meeting: IMeeting }> {
        return this.request(`/api/meetings/${encodeURIComponent(meetingId)}/end-series`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async searchUsers(
        query: string,
        accessToken: string
    ): Promise<{ users: Array<{ id: string; name: string | null; email: string }> }> {
        return this.request(`/api/meetings/users/search?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async addInvitations(
        meetingId: string,
        emails: string[],
        accessToken: string
    ): Promise<{ invitees: IMeetingInvitation[] }> {
        return this.request<{ invitees: IMeetingInvitation[] }>(`/api/meetings/${encodeURIComponent(meetingId)}/invitations`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({ emails })
        });
    }

    public async removeInvitation(
        meetingId: string,
        invitationId: string,
        accessToken: string
    ): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(
            `/api/meetings/${encodeURIComponent(meetingId)}/invitations/${encodeURIComponent(invitationId)}`,
            {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
    }

    public async endMeeting(
        meetingId: string,
        accessToken: string
    ): Promise<{ meeting: IMeeting }> {
        return this.request<{ meeting: IMeeting }>(`/api/meetings/${encodeURIComponent(meetingId)}/end`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }

    public async getPublicMeetingInfo(
        roomId: string,
        accessToken?: string | null
    ): Promise<IPublicMeetingInfo> {
        return this.request<IPublicMeetingInfo>(`/api/meetings/${encodeURIComponent(roomId)}/public-info`, {
            method: 'GET',
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
        });
    }

    public async guestJoinMeeting(
        roomId: string,
        displayName: string,
        passcode?: string
    ): Promise<{
        meeting: IMeeting;
        occurrence?: IMeetingOccurrence;
        session?: IMeetingSessionInfo;
        token: string;
        role: 'participant';
        displayName: string;
    }> {
        return this.request(`/api/meetings/${encodeURIComponent(roomId)}/guest-join`, {
            method: 'POST',
            body: JSON.stringify({
                displayName,
                ...(passcode ? { passcode } : {})
            })
        });
    }

    public async getMeetingToken(
        roomId: string,
        accessToken: string,
        passcode?: string,
        options?: { allowHostAutoStart?: boolean; occurrenceId?: string }
    ): Promise<{
        meeting: IMeeting;
        occurrence?: IMeetingOccurrence;
        session?: IMeetingSessionInfo;
        token: string;
        role: 'owner' | 'moderator' | 'participant';
    }> {
        const params = new URLSearchParams();
        if (passcode) {
            params.set('passcode', passcode);
        }
        if (options?.allowHostAutoStart === false) {
            params.set('autoStart', 'false');
        }
        if (options?.occurrenceId) {
            params.set('occurrenceId', options.occurrenceId);
        }
        const query = params.toString();
        const url = `/api/meetings/${encodeURIComponent(roomId)}/token${query ? `?${query}` : ''}`;
        return this.request(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
    }
}

export const authApiClient = new AuthApiClient();
