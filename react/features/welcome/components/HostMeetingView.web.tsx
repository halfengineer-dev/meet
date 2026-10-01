import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { IReduxState } from '../../app/types';
import { Mic, Video, Settings, Copy, ChevronDown, ChevronRight, User, Shield, MessageSquare } from 'lucide-react';
import Preview from '../../base/premeeting/components/web/Preview';
import { updateSettings } from '../../base/settings/actions';
import { createLocalTracksA } from '../../base/tracks/actions.any';
import { getLocalJitsiVideoTrack } from '../../base/tracks/functions.web';
import { copyText } from '../../base/util/copyText.web';
import { openSettingsDialog } from '../../settings/actions';
import { SETTINGS_TABS } from '../../settings/constants';

interface IProps {
    onHost: (roomName: string, options: any) => void;
    generatedRoomName: string;
}

export default function HostMeetingView({ onHost, generatedRoomName }: IProps) {
    const dispatch = useDispatch();
    const videoTrack = useSelector((state: IReduxState) => getLocalJitsiVideoTrack(state));
    const settings = useSelector((state: IReduxState) => state['features/base/settings']);

    const [ name, setName ] = useState(settings.displayName || 'Guest');
    const [ videoOn, setVideoOn ] = useState(true);
    const [ micOn, setMicOn ] = useState(true);
    const [ waitingRoom, setWaitingRoom ] = useState(true);
    const [ requirePasscode, setRequirePasscode ] = useState(false);
    const [ liveTranscription, setLiveTranscription ] = useState(false);
    const [ isCopied, setIsCopied ] = useState(false);

    useEffect(() => {
        dispatch(createLocalTracksA({ devices: [ 'video', 'audio' ] }));
    }, [ dispatch ]);

    const handleHost = () => {
        dispatch(updateSettings({ displayName: name }));
        
        let roomToJoin = generatedRoomName;
        if (!roomToJoin || roomToJoin.trim() === '') {
            // Generate a random room name if empty
            roomToJoin = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
        }
        
        let passcode = '';
        if (requirePasscode) {
            passcode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit passcode
        }

        onHost(roomToJoin, {
            videoOn,
            micOn,
            waitingRoom,
            requirePasscode: passcode,
            liveTranscription
        });
    };

    const handleCopyLink = async () => {
        const link = `${window.location.origin}/${generatedRoomName}`;
        await copyText(link);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleSettingsClick = () => {
        dispatch(openSettingsDialog(SETTINGS_TABS.AUDIO));
    };

    const handleBgEffectsClick = () => {
        dispatch(openSettingsDialog(SETTINGS_TABS.VIRTUAL_BACKGROUND));
    };

    return (
        <div className = 'fc-host-meeting-wrapper'>
            <div className = 'fc-hm-left'>
                <div className = 'fc-hm-video-container'>
                    <div className = 'fc-hm-bg-effects-btn' onClick = { handleBgEffectsClick }>
                        ⛶ Background effects
                    </div>
                    
                    <div className = 'fc-hm-video-preview'>
                        <Preview
                            videoMuted = { !videoOn }
                            videoTrack = { videoTrack } />
                    </div>

                    <div className = 'fc-hm-controls'>
                        <div className = 'fc-hm-control-item'>
                            <button className = 'fc-hm-icon-btn' onClick = { () => setMicOn(!micOn) }>
                                <Mic size={24} color={micOn ? "white" : "red"} />
                                <div className="fc-hm-chevron">
                                    <ChevronDown size={12} color="white" />
                                </div>
                            </button>
                            <span className = 'fc-hm-control-label'>Microphone</span>
                            <span className = 'fc-hm-control-sublabel'>Default</span>
                        </div>

                        <div className = 'fc-hm-control-item'>
                            <button className = 'fc-hm-icon-btn' onClick = { () => setVideoOn(!videoOn) }>
                                <Video size={24} color={videoOn ? "white" : "red"} />
                                <div className="fc-hm-chevron">
                                    <ChevronDown size={12} color="white" />
                                </div>
                            </button>
                            <span className = 'fc-hm-control-label'>Camera</span>
                            <span className = 'fc-hm-control-sublabel'>FaceTime HD</span>
                        </div>

                        <div className = 'fc-hm-control-item'>
                            <button className = 'fc-hm-icon-btn' onClick = { handleBgEffectsClick }>
                                <div style={{width: 24, height: 24, border: '2px solid white', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                    <div style={{width: 12, height: 12, backgroundColor: 'white', borderRadius: 2}}></div>
                                </div>
                            </button>
                            <span className = 'fc-hm-control-label'>Background</span>
                            <span className = 'fc-hm-control-sublabel'>None</span>
                        </div>

                        <div className = 'fc-hm-control-item'>
                            <button className = 'fc-hm-icon-btn' onClick = { handleSettingsClick }>
                                <Settings size={24} color="white" />
                            </button>
                            <span className = 'fc-hm-control-label'>Settings</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className = 'fc-hm-right'>
                <h1 className = 'fc-hm-title'>Host a meeting</h1>
                <p className = 'fc-hm-subtitle'>Start an instant meeting and invite others to join.</p>

                <div className = 'fc-hm-form'>
                    <label className = 'fc-hm-label'>Your name</label>
                    <input
                        className = 'fc-hm-input'
                        onChange = { e => setName(e.target.value) }
                        type = 'text'
                        value = { name } />

                    <h3 className = 'fc-hm-section-title'>Meeting options</h3>
                    
                    <div className = 'fc-hm-toggles'>
                        <label className = 'fc-hm-toggle-row'>
                            <div className="fc-hm-toggle-label">
                                <Video size={20} color="#6b7280" />
                                <span>Start with video on</span>
                            </div>
                            <div className={`fc-hm-switch ${videoOn ? 'active' : ''}`} onClick={() => setVideoOn(!videoOn)}>
                                <div className="fc-hm-switch-knob"></div>
                            </div>
                        </label>

                        <label className = 'fc-hm-toggle-row'>
                            <div className="fc-hm-toggle-label">
                                <Mic size={20} color="#6b7280" />
                                <span>Start with microphone on</span>
                            </div>
                            <div className={`fc-hm-switch ${micOn ? 'active' : ''}`} onClick={() => setMicOn(!micOn)}>
                                <div className="fc-hm-switch-knob"></div>
                            </div>
                        </label>

                        <label className = 'fc-hm-toggle-row'>
                            <div className="fc-hm-toggle-label">
                                <User size={20} color="#6b7280" />
                                <span>Enable waiting room</span>
                            </div>
                            <div className={`fc-hm-switch ${waitingRoom ? 'active' : ''}`} onClick={() => setWaitingRoom(!waitingRoom)}>
                                <div className="fc-hm-switch-knob"></div>
                            </div>
                        </label>

                        <label className = 'fc-hm-toggle-row'>
                            <div className="fc-hm-toggle-label">
                                <Shield size={20} color="#6b7280" />
                                <span>Require passcode</span>
                            </div>
                            <div className={`fc-hm-switch ${requirePasscode ? 'active' : ''}`} onClick={() => setRequirePasscode(!requirePasscode)}>
                                <div className="fc-hm-switch-knob"></div>
                            </div>
                        </label>

                        <label className = 'fc-hm-toggle-row'>
                            <div className="fc-hm-toggle-label">
                                <MessageSquare size={20} color="#6b7280" />
                                <span>Enable live transcription (captions)</span>
                            </div>
                            <div className={`fc-hm-switch ${liveTranscription ? 'active' : ''}`} onClick={() => setLiveTranscription(!liveTranscription)}>
                                <div className="fc-hm-switch-knob"></div>
                            </div>
                        </label>
                    </div>

                    <div className = 'fc-hm-advanced'>
                        <span>Advanced options</span>
                        <ChevronDown size={16} />
                    </div>

                    <button className = 'fc-hm-btn-start' onClick = { handleHost }>
                        Start meeting
                    </button>

                    <button className = 'fc-hm-btn-copy' onClick = { handleCopyLink }>
                        <Copy size={18} />
                        {isCopied ? 'Copied!' : 'Copy invitation link'}
                    </button>
                </div>
            </div>
        </div>
    );
}
