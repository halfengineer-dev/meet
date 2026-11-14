import crypto from 'crypto';
import { meetingRepository } from '../db/repositories/meeting-repository';
import { userRepository } from '../db/repositories/user-repository';
import { MeetingRecord } from '../db/types';
import { generateJitsiMeetingToken } from '../auth/tokens';

export class MeetingService {
  private generateRoomId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let room = '';
    const bytes = crypto.randomBytes(9);
    for (let i = 0; i < 9; i++) {
      if (i > 0 && i % 3 === 0) room += '-';
      room += chars[bytes[i] % chars.length];
    }
    return room;
  }

  public async createMeeting(
    userId: string,
    title?: string
  ): Promise<{ meeting: MeetingRecord; token: string; role: 'owner' | 'moderator' | 'participant' }> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new Error('User not authorized to create meetings');
    }

    const roomId = this.generateRoomId();
    const meetingTitle = title && title.trim() ? title.trim() : 'Faceonn Meeting';

    const meeting = await meetingRepository.createMeeting({
      room_id: roomId,
      title: meetingTitle,
      owner_user_id: user.id,
    });

    const token = generateJitsiMeetingToken({
      user,
      room: meeting.room_id,
      isModerator: true,
    });

    return {
      meeting,
      token,
      role: 'owner',
    };
  }

  public async getMeetingOrJoin(
    userId: string,
    roomId: string
  ): Promise<{ meeting: MeetingRecord; token: string; role: 'owner' | 'moderator' | 'participant' }> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new Error('Authentication required to access meeting');
    }

    const normalizedRoom = roomId.toLowerCase().trim();
    let meeting = await meetingRepository.findByRoomId(normalizedRoom);

    // If meeting was not pre-created via REST, create it on-demand for this authenticated user as owner
    if (!meeting) {
      meeting = await meetingRepository.createMeeting({
        room_id: normalizedRoom,
        title: `Meeting ${normalizedRoom}`,
        owner_user_id: user.id,
      });
    }

    const isOwner = meeting.owner_user_id === user.id;
    let participant = await meetingRepository.getParticipant(meeting.id, user.id);

    let role: 'owner' | 'moderator' | 'participant' = isOwner ? 'owner' : 'participant';
    if (participant) {
      role = participant.role;
    } else {
      participant = await meetingRepository.addParticipant(meeting.id, user.id, role);
    }

    const isModerator = role === 'owner' || role === 'moderator';
    const token = generateJitsiMeetingToken({
      user,
      room: meeting.room_id,
      isModerator,
    });

    return {
      meeting,
      token,
      role,
    };
  }

  public async listUserMeetings(userId: string): Promise<MeetingRecord[]> {
    return meetingRepository.listUserMeetings(userId);
  }
}

export const meetingService = new MeetingService();

