export interface IUser {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    status: string;
    pmi?: string | null;
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

export interface IMeetingSettings {
    passcodeEnabled: boolean;
    passcode?: string;
    waitingRoomEnabled: boolean;
    joinBeforeHost: boolean;
    hostVideoEnabled: boolean;
    participantVideoEnabled: boolean;
    muteOnEntry: boolean;
    allowScreenSharing: boolean;
    allowChat: boolean;
    allowReactions: boolean;
    requireAuthentication: boolean;
}

export interface IMeeting {
    id: string;
    roomId: string;
    title: string;
    ownerId: string;
    status: 'active' | 'ended' | 'scheduled' | 'cancelled' | string;
    scheduledAt?: string | null;
    durationMinutes?: number;
    timezone?: string;
    description?: string | null;
    isScheduled?: boolean;
    meetingType?: 'instant' | 'scheduled' | 'recurring';
    recurrenceSeriesId?: string | null;
    recurrenceRule?: string | null;
    recurrenceEndAt?: string | null;
    settings?: IMeetingSettings;
    hasPasscode?: boolean;
    createdAt: string;
    updatedAt?: string;
}

export interface IMeetingInvitation {
    id: string;
    meeting_id?: string;
    meetingId?: string;
    email: string;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
    invited_at?: string;
    invitedAt?: string;
    responded_at?: string | null;
    respondedAt?: string | null;
}

export interface IMeetingSession {
    meetingId: string;
    roomId: string;
    title: string;
    role: 'owner' | 'moderator' | 'participant';
    token: string;
}

export interface IScheduleMeetingDTO {
    title: string;
    description?: string;
    scheduledAt: string;
    timezone: string;
    durationMinutes: number;
    meetingType?: 'instant' | 'scheduled' | 'recurring';
    usePmi?: boolean;
    recurrence?: {
        frequency: 'daily' | 'weekly' | 'monthly';
        interval: number;
        weekdays?: number[];
        endDate?: string;
        occurrenceCount?: number;
    };
    settings?: Partial<IMeetingSettings> & { passcode?: string };
    invitees?: string[];
}

export interface IUpdateMeetingDTO {
    title?: string;
    description?: string;
    scheduledAt?: string;
    timezone?: string;
    durationMinutes?: number;
    settings?: Partial<IMeetingSettings> & { passcode?: string };
    scope?: 'occurrence' | 'series';
}

export interface IScheduleMeetingResponse {
    meeting: IMeeting;
    invitees: IMeetingInvitation[];
    token: string;
    roomUrl: string;
    googleCalendarUrl: string;
    outlookCalendarUrl: string;
    icsUrl: string;
    invitationText: string;
}

export interface IMeetingDetailsResponse {
    meeting: IMeeting;
    invitees: IMeetingInvitation[];
    isOwner: boolean;
    googleCalendarUrl: string;
    outlookCalendarUrl: string;
    icsUrl: string;
    invitationText: string;
}
