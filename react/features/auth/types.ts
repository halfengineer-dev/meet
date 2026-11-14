export interface IUser {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
}

export interface IAuthState {
    user: IUser | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isInitializing: boolean;
    isLoading: boolean;
    error: string | null;
    redirectTarget: string | null;
}

export interface IMeeting {
    id: string;
    roomId: string;
    title: string;
    ownerId: string;
    status: string;
    createdAt: string;
}

export interface IMeetingSession {
    meetingId: string;
    roomId: string;
    title: string;
    role: 'owner' | 'moderator' | 'participant';
    token: string;
}

