import { Room } from './room';
import { getNextWorker } from '../media/worker-manager';
import { createRouter } from '../media/router-manager';

class RoomManager {
  private rooms: Map<string, Room> = new Map();

  public async getOrCreateRoom(roomId: string): Promise<Room> {
    let room = this.rooms.get(roomId);
    
    if (!room) {
      console.log(`[Rooms] Creating new room: ${roomId}`);
      const worker = getNextWorker();
      const router = await createRouter(worker);
      room = new Room(roomId, router);
      this.rooms.set(roomId, room);
    }

    return room;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public removeRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.close();
      this.rooms.delete(roomId);
      console.log(`[Rooms] Room destroyed: ${roomId}`);
    }
  }
}

export const roomManager = new RoomManager();
