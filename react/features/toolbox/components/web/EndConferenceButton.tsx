import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { authApiClient } from '../../../auth/api';
import EndMeetingConfirmDialog from '../../../auth/components/EndMeetingConfirmDialog.web';
import { getAccessToken, getActiveMeetingSession } from '../../../auth/functions';
import { endConference } from '../../../base/conference/actions';
import { openDialog } from '../../../base/dialog/actions';
import { isLocalParticipantModerator } from '../../../base/participants/functions';
import { BUTTON_TYPES } from '../../../base/ui/constants.web';
import { isInBreakoutRoom } from '../../../breakout-rooms/functions';

import { HangupContextMenuItem } from './HangupContextMenuItem';

/**
 * The type of the React {@code Component} props of {@link EndConferenceButton}.
 */
interface IProps {

    /**
     * Key to use for toolbarButtonClicked event.
     */
    buttonKey: string;

    /**
     * Notify mode for `toolbarButtonClicked` event -
     * whether to only notify or to also prevent button click routine.
     */
    notifyMode?: string;
}


/**
 * Button to end the conference for all participants.
 *
 * @param {Object} props - Component's props.
 * @returns {JSX.Element} - The end conference button.
 */
export const EndConferenceButton = (props: IProps) => {
    const { t } = useTranslation();
    const dispatch = useDispatch<any>();
    const _isLocalParticipantModerator = useSelector(isLocalParticipantModerator);
    const _isInBreakoutRoom = useSelector(isInBreakoutRoom);
    const activeSession = useSelector(getActiveMeetingSession);
    const accessToken = useSelector(getAccessToken);

    // Backend-authoritative host check when managed by Faceonn session lifecycle
    const canEndMeeting = activeSession ? activeSession.isHost : _isLocalParticipantModerator;

    const onEndConference = useCallback(async () => {
        if (activeSession?.isHost && accessToken) {
            if (activeSession.isRecurring) {
                dispatch(openDialog('EndMeetingConfirmDialog', EndMeetingConfirmDialog));

                return;
            }

            try {
                await authApiClient.endOccurrence(
                    activeSession.meetingId,
                    accessToken,
                    activeSession.occurrenceId || undefined
                );
            } catch (_) {
                // Still terminate Jitsi conference cleanly even if request raced
            }
        }

        dispatch(endConference());
    }, [ accessToken, activeSession, dispatch ]);

    return (<>
        { !_isInBreakoutRoom && canEndMeeting && <HangupContextMenuItem
            accessibilityLabel = { t('toolbar.accessibilityLabel.endConference') }
            buttonKey = { props.buttonKey }
            buttonType = { BUTTON_TYPES.DESTRUCTIVE }
            label = { t('toolbar.endConference') }
            notifyMode = { props.notifyMode }
            onClick = { onEndConference } /> }
    </>);
};
