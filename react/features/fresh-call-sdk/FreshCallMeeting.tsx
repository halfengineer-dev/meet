import React, { useEffect, useState, useRef } from 'react';
import { FreshCallClient } from './FreshCallClient';
import { initFreshCallReduxBridge } from './redux-bridge';
import { useDispatch, useStore, useSelector } from 'react-redux';
import { IReduxState } from '../../app/types';

export default function FreshCallMeeting() {
    const store = useStore();
    const dispatch = useDispatch();
    const roomName = useSelector((state: IReduxState) => state['features/base/conference'].room);
    const displayName = useSelector((state: IReduxState) => state['features/base/settings'].displayName) || 'Guest';

    const [client] = useState(() => new FreshCallClient('http://localhost:3000'));
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tracks, setTracks] = useState<any[]>([]);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const localAudioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (!roomName) return;

        // Initialize Redux Bridge
        initFreshCallReduxBridge(client, store);

        // Track listener for UI rendering
        client.on('trackAdded', ({ participantId, kind, track }) => {
            setTracks(prev => [...prev, { participantId, kind, track }]);
        });

        client.on('trackRemoved', ({ track }) => {
            setTracks(prev => prev.filter(t => t.track.id !== track.id));
        });

        async function init() {
            try {
                // Connect to backend
                await client.connectAndJoin(roomName!, displayName);
                setConnected(true);

                // Setup local camera/mic
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: { width: 1280, height: 720 }
                });

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = new MediaStream([stream.getVideoTracks()[0]]);
                }
                if (localAudioRef.current) {
                    // Mute local audio to prevent feedback loop
                    localAudioRef.current.srcObject = new MediaStream([stream.getAudioTracks()[0]]);
                    localAudioRef.current.muted = true; 
                }

                // Send to server
                await client.produce(stream.getAudioTracks()[0]);
                await client.produce(stream.getVideoTracks()[0]);

            } catch (e: any) {
                console.error('Failed to connect to Custom Backend:', e);
                setError(e.message);
            }
        }

        init();

        return () => {
            client.leave();
        };
    }, [roomName]);

    if (error) {
        return (
            <div style={{ padding: 40, color: 'white', backgroundColor: 'black', height: '100vh' }}>
                <h1>Connection Failed</h1>
                <p>{error}</p>
            </div>
        );
    }

    if (!connected) {
        return (
            <div style={{ padding: 40, color: 'white', backgroundColor: 'black', height: '100vh' }}>
                <h1>Connecting to Fresh Call Backend...</h1>
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: '#111', height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 20, color: 'white', display: 'flex', justifyContent: 'space-between' }}>
                <h2>Meeting: {roomName}</h2>
                <button onClick={() => client.leave()} style={{ background: 'red', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8 }}>
                    Leave Meeting
                </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: 20, flex: 1 }}>
                {/* Local Video */}
                <div style={{ flex: 1, minWidth: 300, background: 'black', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                    <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <audio ref={localAudioRef} autoPlay playsInline muted />
                    <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: 4 }}>
                        You ({displayName})
                    </div>
                </div>

                {/* Remote Videos */}
                {tracks.filter(t => t.kind === 'video').map((t, idx) => (
                    <RemoteMedia key={idx} trackInfo={t} />
                ))}
                
                {/* Hidden Audio Elements for Remote Audio */}
                {tracks.filter(t => t.kind === 'audio').map((t, idx) => (
                    <RemoteMedia key={`audio-${idx}`} trackInfo={t} />
                ))}
            </div>
        </div>
    );
}

function RemoteMedia({ trackInfo }: { trackInfo: any }) {
    const ref = useRef<any>(null);

    useEffect(() => {
        if (ref.current && trackInfo.track) {
            ref.current.srcObject = new MediaStream([trackInfo.track]);
        }
    }, [trackInfo]);

    if (trackInfo.kind === 'audio') {
        return <audio ref={ref} autoPlay playsInline />;
    }

    return (
        <div style={{ flex: 1, minWidth: 300, background: 'black', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
            <video ref={ref} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: 4 }}>
                Participant
            </div>
        </div>
    );
}
