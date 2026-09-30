/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import clsx from 'clsx';
import React, { ReactNode, useEffect, useState, useCallback } from 'react';
import { connect, useDispatch } from 'react-redux';
import { makeStyles } from 'tss-react/mui';

import { IReduxState } from '../../../../app/types';
import { getLobbyConfig } from '../../../../lobby/functions';
import DeviceStatus from '../../../../prejoin/components/web/preview/DeviceStatus';
import { isRoomNameEnabled } from '../../../../prejoin/functions.web';
import Toolbox from '../../../../toolbox/components/web/Toolbox';
import { isButtonEnabled } from '../../../../toolbox/functions.web';
import { getConferenceName } from '../../../conference/functions';
import { PREMEETING_BUTTONS, THIRD_PARTY_PREJOIN_BUTTONS } from '../../../config/constants';
import { openSettingsDialog } from '../../../../settings/actions.web';
import { SETTINGS_TABS } from '../../../../settings/constants';
import Tooltip from '../../../tooltip/components/Tooltip';
import { isPreCallTestEnabled } from '../../functions';

import ConnectionStatus from './ConnectionStatus';
import Preview from './Preview';
import RecordingWarning from './RecordingWarning';
import UnsafeRoomWarning from './UnsafeRoomWarning';

interface IProps {

    /**
     * The list of toolbar buttons to render.
     */
    _buttons: Array<string>;

    /**
     * Determine if pre call test is enabled.
     */
    _isPreCallTestEnabled?: boolean;

    /**
     * The branding background of the premeeting screen(lobby/prejoin).
     */
    _premeetingBackground: string;

    /**
     * The name of the meeting that is about to be joined.
     */
    _roomName: string;

    /**
     * Children component(s) to be rendered on the screen.
     */
    children?: ReactNode;

    /**
     * Additional CSS class names to set on the icon container.
     */
    className?: string;

    /**
     * The name of the participant.
     */
    name?: string;

    /**
     * Indicates whether the copy url button should be shown.
     */
    showCopyUrlButton?: boolean;

    /**
     * Indicates whether the device status should be shown.
     */
    showDeviceStatus: boolean;

    /**
     * Indicates whether to display the recording warning.
     */
    showRecordingWarning?: boolean;

    /**
     * If should show unsafe room warning when joining.
     */
    showUnsafeRoomWarning?: boolean;

    /**
     * The 'Skip prejoin' button to be rendered (if any).
     */
    skipPrejoinButton?: ReactNode;

    /**
     * Whether it's used in the 3rdParty prejoin screen or not.
     */
    thirdParty?: boolean;

    /**
     * Title of the screen.
     */
    title?: string;

    /**
     * True if the preview overlay should be muted, false otherwise.
     */
    videoMuted?: boolean;

    /**
     * The video track to render as preview (if omitted, the default local track will be rendered).
     */
    videoTrack?: Object;
}

const useStyles = makeStyles()(theme => {
    return {
        container: {
            height: '100%',
            position: 'absolute',
            inset: '0 0 0 0',
            display: 'flex',
            backgroundColor: theme.palette.preMeetingBackground,
            zIndex: 252,

            '@media (max-width: 720px)': {
                flexDirection: 'column-reverse'
            }
        },
        content: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flexShrink: 0,
            boxSizing: 'border-box',
            padding: '24px 0 16px',
            position: 'relative',
            width: '400px',
            height: '100%',
            zIndex: 252,

            '@media (max-width: 720px)': {
                height: 'auto',
                margin: '0 auto'
            },

            // mobile phone landscape
            '@media (max-width: 420px)': {
                padding: '16px 16px 0 16px',
                width: '100%'
            },

            '@media (max-width: 400px)': {
                padding: '16px'
            }
        },
        contentControls: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            margin: 'auto',
            width: '100%'
        },
        paddedContent: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 50px',

            '& > *': {
                width: '100%',
                boxSizing: 'border-box'
            }
        },
        title: {
            ...theme.typography.heading4,
            color: theme.palette.prejoinTitleText,
            marginBottom: theme.spacing(3),
            textAlign: 'center',

            '@media (max-width: 400px)': {
                display: 'none'
            }
        },
        roomNameContainer: {
            width: '100%',
            textAlign: 'center',
            marginBottom: theme.spacing(4)
        },

        roomName: {
            ...theme.typography.heading5,
            color: theme.palette.prejoinRoomNameText,
            display: 'inline-block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
        }
    };
});

const PreMeetingScreen = ({
    _buttons,
    _isPreCallTestEnabled,
    _premeetingBackground,
    _roomName,
    children,
    className,
    showDeviceStatus,
    showRecordingWarning,
    showUnsafeRoomWarning,
    skipPrejoinButton,
    title,
    videoMuted,
    videoTrack
}: IProps) => {
    const { classes, cx } = useStyles();
    const dispatch = useDispatch();

    const [ timeDisplay, setTimeDisplay ] = useState('');

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
            const dateStr = now.toLocaleDateString('en-US', options);
            const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const endNow = new Date(now.getTime() + 60 * 60 * 1000);
            const endTimeStr = endNow.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

            setTimeDisplay(`${dateStr} | ${timeStr} – ${endTimeStr}`);
        };

        updateTime();
        const interval = setInterval(updateTime, 60000);

        return () => clearInterval(interval);
    }, []);

    const onBgClick = () => {
        dispatch(openSettingsDialog(SETTINGS_TABS.VIRTUAL_BACKGROUND));
    };

    return (
        <div className = { clsx('fresh-call-prejoin-wrapper', className) }>
            <div className = 'fc-header'>
                <div className = 'fc-logo'>
                    <img
                        alt = 'logo'
                        src = 'images/favicon.svg' />
                    <span>fresh call</span>
                </div>
                <div className = 'fc-user'>
                    <div className = 'fc-avatar'>S</div>
                    <span className = 'fc-username'>Sourav ▾</span>
                </div>
            </div>

            <div className = 'fc-main-content'>
                <div className = 'fc-left-panel'>
                    <div className = 'fc-preview-wrapper'>
                        <Preview
                            videoMuted = { videoMuted }
                            videoTrack = { videoTrack } />

                        <div
                            className = 'fc-bg-effects-pill'
                            onClick = { onBgClick }
                            style = {{ cursor: 'pointer' }}>
                            ✨ Background effects
                        </div>
                        <div className = 'fc-preview-toolbox'>
                            {_buttons.length > 0 && <Toolbox toolbarButtons = { _buttons } />}
                        </div>
                    </div>
                </div>

                <div className = 'fc-right-panel'>
                    <h3 className = 'fc-prejoin-title'>You're about to join</h3>
                    <h1 className = 'fc-room-name'>{_roomName}</h1>

                    <div className = 'fc-date-info'>
                        <img
                            alt = 'cal'
                            className = 'fc-cal-icon'
                            src = 'images/calendar.svg' /> {timeDisplay}
                    </div>

                    <div className = 'fc-info-banner'>
                        <span className = 'fc-info-icon'>ℹ️</span> Check your audio and video settings before joining.
                    </div>

                    <div className = 'fc-form-area'>
                        <label className = 'fc-label'>Your name</label>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};


/**
 * Maps (parts of) the redux state to the React {@code Component} props.
 *
 * @param {Object} state - The redux state.
 * @param {Object} ownProps - The props passed to the component.
 * @returns {Object}
 */
function mapStateToProps(state: IReduxState, ownProps: Partial<IProps>) {
    const { hiddenPremeetingButtons, prejoinConfig } = state['features/base/config'];
    const { toolbarButtons } = state['features/toolbox'];
    const { knocking } = state['features/lobby'];
    const { showHangUp: showHangUpLobby = true } = getLobbyConfig(state);
    const { showHangUp: showHangUpPrejoin = true } = prejoinConfig || {};
    const premeetingButtons = (ownProps.thirdParty
        ? THIRD_PARTY_PREJOIN_BUTTONS
        : PREMEETING_BUTTONS).filter((b: any) => !(hiddenPremeetingButtons || []).includes(b));

    const shouldShowHangUp = knocking ? showHangUpLobby : showHangUpPrejoin;

    if (shouldShowHangUp && !premeetingButtons.includes('hangup')) {
        premeetingButtons.push('hangup');
    }

    const { premeetingBackground } = state['features/dynamic-branding'];

    return {
        // For keeping backwards compat.: if we pass an empty hiddenPremeetingButtons
        // array through external api, we have all prejoin buttons present on premeeting
        // screen regardless of passed values into toolbarButtons config overwrite.
        // If hiddenPremeetingButtons is missing, we hide the buttons according to
        // toolbarButtons config overwrite.
        _buttons: hiddenPremeetingButtons
            ? premeetingButtons
            : premeetingButtons.filter(b => isButtonEnabled(b, toolbarButtons)),
        _isPreCallTestEnabled: isPreCallTestEnabled(state),
        _premeetingBackground: premeetingBackground,
        _roomName: isRoomNameEnabled(state) ? getConferenceName(state) : ''
    };
}

export default connect(mapStateToProps)(PreMeetingScreen);

