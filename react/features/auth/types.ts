export interface IUser {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    role?: 'admin' | 'user';
    adminRole?: string | null;
    isAdmin?: boolean;
    adminScope?: 'platform' | 'organization' | null;
    platformRole?: string | null;
    orgRole?: string | null;
    scopedOrganizationId?: string | null;
    organizationName?: string | null;
    permissions?: string[];
    organizationId?: string | null;
    country?: string | null;
    status: string;
    pmi?: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    lastActiveAt?: string | null;
}

export interface IActiveMeetingSession {
    meetingId: string;
    publicRoomId: string;
    jitsiRoomName: string;
    occurrenceId: string;
    sessionId: string;
    title: string;
    role: 'owner' | 'moderator' | 'participant';
    isHost: boolean;
    isOwner: boolean;
    isRecurring: boolean;
}

export interface IAuthState {
    user: IUser | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isInitializing: boolean;
    isLoading: boolean;
    error: string | null;
    redirectTarget: string | null;
    activeMeetingSession?: IActiveMeetingSession | null;
}

export interface IMeetingSettings {
    passcodeEnabled: boolean;
    passcode?: string;
    waitingRoomEnabled: boolean;
    joinBeforeHost: boolean;
    joinBeforeHostMinutes?: number;
    hostVideoEnabled: boolean;
    participantVideoEnabled: boolean;
    muteOnEntry: boolean;
    allowParticipantsUnmute?: boolean;
    allowScreenSharing: boolean;
    allowChat: boolean;
    allowReactions: boolean;
    allowRecording?: boolean;
    requireAuthentication: boolean;
    registrationRequired?: boolean;
    audioType?: 'computer' | 'telephone' | 'both';
    autoRecording?: 'none' | 'local' | 'cloud';
}

export interface IMeetingOccurrence {
    id: string;
    meetingId: string;
    occurrenceNumber: number;
    scheduledAt: string;
    scheduledEndAt: string;
    actualStartedAt: string | null;
    actualEndedAt: string | null;
    status: 'scheduled' | 'waiting_for_host' | 'active' | 'ended' | 'cancelled' | 'missed';
    sessionId: string | null;
    startedByUserId: string | null;
    endedByUserId: string | null;
}

export interface IMeetingSessionInfo {
    id: string;
    meetingId: string;
    occurrenceId: string;
    jitsiRoomName: string;
    status: 'active' | 'ended';
    startedAt: string;
    endedAt: string | null;
}

export interface IAlternativeHost {
    id?: string;
    userId: string;
    name: string | null;
    email: string;
}

export interface IMeeting {
    id: string;
    roomId: string;
    title: string;
    ownerId: string;
    status: 'active' | 'ended' | 'scheduled' | 'cancelled' | string;
    seriesStatus?: 'active' | 'ended' | 'cancelled' | 'expired' | string;
    scheduledAt?: string | null;
    durationMinutes?: number;
    timezone?: string;
    description?: string | null;
    isScheduled?: boolean;
    meetingType?: 'instant' | 'scheduled' | 'recurring';
    recurrenceSeriesId?: string | null;
    recurrenceType?: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';
    recurrenceRule?: string | null;
    recurrenceEndAt?: string | null;
    recurrenceCount?: number | null;
    joinBeforeHostMinutes?: number;
    alternativeHostIds?: string[];
    settings?: IMeetingSettings;
    hasPasscode?: boolean;
    endedAt?: string | null;
    expiresAt?: string | null;
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
        frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';
        interval: number;
        weekdays?: number[];
        monthlyMode?: 'day_of_month' | 'nth_weekday';
        monthlyWeek?: number;
        monthlyWeekday?: number;
        customRrule?: string;
        endDate?: string;
        occurrenceCount?: number;
    };
    settings?: Partial<IMeetingSettings> & { passcode?: string };
    invitees?: string[];
    alternativeHostIds?: string[];
}

export interface IUpdateMeetingDTO {
    title?: string;
    description?: string;
    scheduledAt?: string;
    timezone?: string;
    durationMinutes?: number;
    recurrence?: IScheduleMeetingDTO['recurrence'];
    settings?: Partial<IMeetingSettings> & { passcode?: string };
    alternativeHostIds?: string[];
    scope?: 'occurrence' | 'following' | 'series';
    occurrenceId?: string;
}

export interface IScheduleMeetingResponse {
    meeting: IMeeting;
    occurrences?: IMeetingOccurrence[];
    invitees: IMeetingInvitation[];
    alternativeHosts?: IAlternativeHost[];
    token: string;
    roomUrl: string;
    googleCalendarUrl: string;
    outlookCalendarUrl: string;
    icsUrl: string;
    invitationText: string;
    recurrenceSummary?: string | null;
}

export interface IMeetingDetailsResponse {
    meeting: IMeeting;
    occurrences?: IMeetingOccurrence[];
    nextOccurrence?: IMeetingOccurrence | null;
    alternativeHosts?: IAlternativeHost[];
    invitees: IMeetingInvitation[];
    isOwner: boolean;
    isHost?: boolean;
    googleCalendarUrl: string;
    outlookCalendarUrl: string;
    icsUrl: string;
    invitationText: string;
    recurrenceSummary?: string | null;
}

export interface IPublicMeetingInfo {
    exists: boolean;
    resolutionStatus?: 'not_found' | 'cancelled' | 'expired' | 'ended' | 'waiting_for_host' | 'active';
    id?: string;
    roomId: string;
    title?: string;
    hostName?: string;
    status?: 'active' | 'ended' | 'scheduled' | 'cancelled';
    seriesStatus?: string;
    isScheduled?: boolean;
    meetingType?: 'instant' | 'scheduled' | 'recurring';
    scheduledAt?: string | null;
    durationMinutes?: number;
    timezone?: string;
    recurrenceRule?: string | null;
    recurrenceSummary?: string | null;
    joinBeforeHost?: boolean;
    joinBeforeHostMinutes?: number;
    canJoinBeforeHostNow?: boolean;
    passcodeEnabled?: boolean;
    waitingRoomEnabled?: boolean;
    requireAuthentication?: boolean;
    isOwner?: boolean;
    isAlternativeHost?: boolean;
    isHost?: boolean;
    countdownSeconds?: number | null;
    activeOccurrence?: {
        id: string;
        occurrenceNumber: number;
        scheduledAt: string;
        scheduledEndAt: string;
        status: string;
    } | null;
    nextOccurrence?: {
        id: string;
        occurrenceNumber: number;
        scheduledAt: string;
        scheduledEndAt: string;
        status: string;
    } | null;
    lastEndedOccurrence?: {
        id: string;
        occurrenceNumber: number;
        scheduledAt: string;
        actualEndedAt: string | null;
    } | null;
}
