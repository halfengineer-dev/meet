/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles, @typescript-eslint/no-unused-vars */
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { IReduxState } from '../../app/types';
import Icon from '../../base/icons/components/Icon';
import { IconMic, IconVideo, IconVolumeUp } from '../../base/icons/svg';
import Preview from '../../base/premeeting/components/web/Preview';
import { updateSettings } from '../../base/settings/actions';
import { createLocalTracksA } from '../../base/tracks/actions.any';
import { getLocalJitsiVideoTrack } from '../../base/tracks/functions.web';
import { openSettingsDialog } from '../../settings/actions';
import { SETTINGS_TABS } from '../../settings/constants';
import { toggleBackgroundEffect } from '../../virtual-background/actions';

interface IProps {
    onJoin: (roomName: string) => void;
}

export default function JoinMeetingView({ onJoin }: IProps) {
    const dispatch = useDispatch();
    const videoTrack = useSelector((state: IReduxState) => getLocalJitsiVideoTrack(state));
    const availableDevices = useSelector((state: IReduxState) => state['features/base/devices'].availableDevices);
    const settings = useSelector((state: IReduxState) => state['features/base/settings']);

    const [ room, setRoom ] = useState('');
    const [ name, setName ] = useState('Sourav Dubey');
    const [ rememberName, setRememberName ] = useState(true);
    const [ noAudio, setNoAudio ] = useState(false);
    const [ noVideo, setNoVideo ] = useState(false);
    const [ dontShowAgain, setDontShowAgain ] = useState(false);
    const [ bgEffects, setBgEffects ] = useState(false);

    useEffect(() => {
        dispatch(createLocalTracksA({ devices: [ 'video', 'audio' ] }));
    }, [ dispatch ]);

    const handleJoin = () => {
        if (room.trim()) {
            // Also dispatch name update if needed
            dispatch(updateSettings({ displayName: name }));
            onJoin(room);
        }
    };

    const handleBgEffectsClick = async () => {
        dispatch(openSettingsDialog(SETTINGS_TABS.VIRTUAL_BACKGROUND));
        // We can also toggle blur automatically if we wanted, but the dialog is better.
    };

    return (
        <div className = 'fc-join-meeting-wrapper'>
            <div className = 'fc-jm-left'>
                <h1 className = 'fc-jm-title'>Join a meeting</h1>
                <p className = 'fc-jm-subtitle'>Enter the meeting details to join a video call</p>

                <div className = 'fc-jm-form-group'>
                    <label className = 'fc-jm-label'>Meeting ID or Personal Link Name</label>
                    <input
                        className = 'fc-jm-input'
                        onChange = { e => setRoom(e.target.value) }
                        placeholder = 'e.g. 123 456 789 or team-meeting'
                        type = 'text'
                        value = { room } />

                    <label className = 'fc-jm-label'>Your name</label>
                    <input
                        className = 'fc-jm-input'
                        onChange = { e => setName(e.target.value) }
                        type = 'text'
                        value = { name } />

                    <label className = 'fc-jm-checkbox'>
                        <input
                            checked = { rememberName }
                            onChange = { e => setRememberName(e.target.checked) }
                            type = 'checkbox' />
                        Remember my name for future meetings
                    </label>

                    <label className = 'fc-jm-checkbox'>
                        <input
                            checked = { noAudio }
                            onChange = { e => setNoAudio(e.target.checked) }
                            type = 'checkbox' />
                        Don't connect to audio
                    </label>

                    <button
                        className = 'fc-jm-btn-join'
                        disabled = { !room.trim() }
                        onClick = { handleJoin }>
                        Join meeting
                    </button>
                </div>
            </div>

            <div className = 'fc-jm-right'>
                <h3 className = 'fc-jm-preview-title'>Video preview</h3>
                <p className = 'fc-jm-preview-subtitle'>Check your audio and video before joining</p>

                <div className = 'fc-jm-video-container'>
                    <div
                        className = 'fc-bg-effects-pill'
                        onClick = { handleBgEffectsClick }>
                        ⛶ Background effects
                    </div>
                    <div className = 'fc-video-preview'>
                        <Preview
                            videoMuted = { noVideo }
                            videoTrack = { videoTrack } />
                    </div>
                </div>

                <div className = 'fc-jm-devices'>
                    <div className = 'fc-device-select'>
                        <Icon
                            className = 'fc-device-icon'
                            size = { 16 }
                            src = { IconMic } />
                        <select
                            onChange = { e => dispatch(updateSettings({ micDeviceId: e.target.value })) }
                            value = { settings.micDeviceId || '' }>
                            {(availableDevices?.audioInput || []).map((d: any) => (
                                <option
                                    key = { d.deviceId }
                                    value = { d.deviceId }>{d.label || 'Microphone'}</option>
                            ))}
                        </select>
                        <span className = 'fc-device-arrow'>▼</span>
                    </div>

                    <div className = 'fc-device-select'>
                        <Icon
                            className = 'fc-device-icon'
                            size = { 16 }
                            src = { IconVideo } />
                        <select
                            onChange = { e => dispatch(updateSettings({ cameraDeviceId: e.target.value })) }
                            value = { settings.cameraDeviceId || '' }>
                            {(availableDevices?.videoInput || []).map((d: any) => (
                                <option
                                    key = { d.deviceId }
                                    value = { d.deviceId }>{d.label || 'Camera'}</option>
                            ))}
                        </select>
                        <span className = 'fc-device-arrow'>▼</span>
                    </div>

                    <div className = 'fc-device-select'>
                        <Icon
                            className = 'fc-device-icon'
                            size = { 16 }
                            src = { IconVolumeUp } />
                        <select
                            onChange = { e => dispatch(updateSettings({ audioOutputDeviceId: e.target.value })) }
                            value = { settings.audioOutputDeviceId || '' }>
                            {(availableDevices?.audioOutput || []).map((d: any) => (
                                <option
                                    key = { d.deviceId }
                                    value = { d.deviceId }>{d.label || 'Speaker'}</option>
                            ))}
                        </select>
                        <span className = 'fc-device-arrow'>▼</span>
                    </div>
                </div>

                <div className = 'fc-jm-bottom-checks'>
                    <label>
                        <input
                            checked = { noVideo }
                            onChange = { e => setNoVideo(e.target.checked) }
                            type = 'checkbox' />
                        Turn off my video when joining
                    </label>
                    <label>
                        <input
                            checked = { dontShowAgain }
                            onChange = { e => setDontShowAgain(e.target.checked) }
                            type = 'checkbox' />
                        Don't show this preview again
                    </label>
                </div>
            </div>
        </div>
    );
}
