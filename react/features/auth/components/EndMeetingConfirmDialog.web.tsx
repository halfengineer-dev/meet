import React, { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { endConference } from '../../base/conference/actions';
import { hideDialog } from '../../base/dialog/actions';
import Dialog from '../../base/ui/components/web/Dialog';
import { authApiClient } from '../api';
import { getAccessToken, getActiveMeetingSession } from '../functions';

/**
 * Confirmation dialog for ending either the current recurring occurrence
 * or the entire recurring meeting series.
 *
 * @returns {JSX.Element}
 */
export default function EndMeetingConfirmDialog() {
    const dispatch = useDispatch<any>();
    const accessToken = useSelector(getAccessToken);
    const activeSession = useSelector(getActiveMeetingSession);
    const [ ending, setEnding ] = useState<'occurrence' | 'series' | null>(null);
    const [ error, setError ] = useState<string | null>(null);

    const handleEndOccurrence = useCallback(async () => {
        setEnding('occurrence');
        setError(null);
        try {
            if (activeSession && accessToken) {
                await authApiClient.endOccurrence(
                    activeSession.meetingId,
                    accessToken,
                    activeSession.occurrenceId || undefined
                );
            }
            dispatch(hideDialog());
            dispatch(endConference());
        } catch (err: any) {
            setError(err.message || 'Failed to end meeting occurrence.');
            setEnding(null);
        }
    }, [ accessToken, activeSession, dispatch ]);

    const handleEndSeries = useCallback(async () => {
        setEnding('series');
        setError(null);
        try {
            if (activeSession && accessToken) {
                await authApiClient.endSeries(activeSession.meetingId, accessToken);
            }
            dispatch(hideDialog());
            dispatch(endConference());
        } catch (err: any) {
            setError(err.message || 'Failed to end meeting series.');
            setEnding(null);
        }
    }, [ accessToken, activeSession, dispatch ]);

    return (
        <Dialog
            cancel = {{ hidden: false }}
            ok = {{ hidden: true }}
            title = { `End "${activeSession?.title || 'Meeting'}"` }>
            <div className = 'faceonn-end-dialog-body'>
                <p className = 'faceonn-end-dialog-desc'>
                    Choose whether to end only today&apos;s session or cancel the entire recurring series.
                </p>

                {error && (
                    <div className = 'faceonn-end-dialog-error'>
                        ⚠️ {error}
                    </div>
                )}

                <button
                    className = 'faceonn-end-dialog-option primary'
                    disabled = { ending !== null }
                    onClick = { handleEndOccurrence }
                    type = 'button'>
                    <strong>
                        {ending === 'occurrence' ? 'Ending Session...' : 'End Meeting'}
                    </strong>
                    <span>
                        End this meeting for everyone. Future scheduled occurrences will remain available.
                    </span>
                </button>

                {activeSession?.isOwner && (
                    <button
                        className = 'faceonn-end-dialog-option danger'
                        disabled = { ending !== null }
                        onClick = { handleEndSeries }
                        type = 'button'>
                        <strong>
                            {ending === 'series' ? 'Cancelling Series...' : 'End Meeting Series'}
                        </strong>
                        <span>
                            End this meeting and cancel all future occurrences. The meeting link will no longer work.
                        </span>
                    </button>
                )}
            </div>
        </Dialog>
    );
}
