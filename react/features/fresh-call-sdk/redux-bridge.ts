import { FreshCallClient } from './FreshCallClient';
import { IStore } from '../../app/types';

/**
 * This bridge connects our custom Node.js/mediasoup backend SDK 
 * to the existing Jitsi Meet Redux state.
 */
export function initFreshCallReduxBridge(client: FreshCallClient, store: IStore) {
  
  // 1. Participant joined
  client.on('participantJoined', (participant) => {
    store.dispatch({
      type: 'PARTICIPANT_JOINED',
      participant: {
        id: participant.id,
        name: participant.displayName,
        role: 'participant',
        local: false
      }
    });
  });

  // 2. Participant left
  client.on('participantLeft', (participantId) => {
    store.dispatch({
      type: 'PARTICIPANT_LEFT',
      participant: { id: participantId }
    });
  });

  // 3. Track added (Audio or Video from someone else)
  client.on('trackAdded', ({ participantId, kind, track }) => {
    // We create a "fake" JitsiRemoteTrack object that satisfies the UI's requirements
    const jitsiTrack = {
      jitsiTrack: {
        isLocal: () => false,
        getType: () => kind,
        getParticipantId: () => participantId,
        track: track,
        // The UI needs this to attach to video elements
        attach: (element: HTMLMediaElement) => {
          const stream = new MediaStream([track]);
          element.srcObject = stream;
          if (kind === 'video') {
            element.play().catch(e => console.error('Play failed', e));
          }
        },
        detach: (element: HTMLMediaElement) => {
          element.srcObject = null;
        }
      }
    };

    store.dispatch({
      type: 'TRACK_ADDED',
      track: jitsiTrack
    });
  });

  // 4. Track removed
  client.on('trackRemoved', ({ track }) => {
    store.dispatch({
      type: 'TRACK_REMOVED',
      track: {
        jitsiTrack: {
          track: track
        }
      }
    });
  });
}
