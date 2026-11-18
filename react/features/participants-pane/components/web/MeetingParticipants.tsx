import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connect, useDispatch, useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';

import { IReduxState } from '../../../app/types';
import participantsPaneTheme from '../../../base/components/themes/participantsPaneTheme.json';
import {
    addFakeParticipants,
    cancelPendingFakeParticipants,
    removeAllFakeParticipants,
    removeFakeParticipants
} from '../../../base/participants/actions';
import {
    getLoadTestFakeParticipantsCount,
    getParticipantById,
    isLocalParticipantModerator,
    isScreenShareParticipant
} from '../../../base/participants/functions';
import Button from '../../../base/ui/components/web/Button';
import Input from '../../../base/ui/components/web/Input';
import { BUTTON_TYPES } from '../../../base/ui/constants.web';
import useContextMenu from '../../../base/ui/hooks/useContextMenu.web';
import { normalizeAccents } from '../../../base/util/strings.web';
import { getBreakoutRooms, getCurrentRoomId, isInBreakoutRoom } from '../../../breakout-rooms/functions';
import { isButtonEnabled, showOverflowDrawer } from '../../../toolbox/functions.web';
import { iAmVisitor } from '../../../visitors/functions';
import { getSortedParticipantIds, isCurrentRoomRenamable, shouldRenderInviteButton } from '../../functions';
import { useParticipantDrawer } from '../../hooks.web';
import RenameButton from '../breakout-rooms/components/web/RenameButton';

import { InviteButton } from './InviteButton';
import MeetingParticipantContextMenu from './MeetingParticipantContextMenu';
import MeetingParticipantItems from './MeetingParticipantItems';

const useStyles = makeStyles()(theme => {
    return {
        headingW: {
            color: theme.palette.participantWarningText
        },
        heading: {
            color: theme.palette.participantSectionText,
            ...theme.typography.bodyShortBold,
            marginBottom: theme.spacing(3),

            [`@media(max-width: ${participantsPaneTheme.MD_BREAKPOINT})`]: {
                ...theme.typography.bodyShortBoldLarge
            }
        },

        search: {
            margin: `${theme.spacing(3)} 0`,

            '& input': {
                textAlign: 'center',
                paddingRight: '16px'
            }
        },

        fakeParticipantsContainer: {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            margin: `${theme.spacing(2)} 0`
        },

        fakeParticipantsActions: {
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
        },

        fakeParticipantsActionBtn: {
            flex: 1
        },

        fakeParticipantsStatus: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            color: theme.palette.text02,
            ...theme.typography.labelRegular
        }
    };
});

interface IProps {
    currentRoom?: {
        jid: string;
        name: string;
    };
    fakeParticipantsCount?: number;
    isModerator?: boolean;
    overflowDrawer?: boolean;
    participantsCount?: number;
    pendingFakeParticipantsAddCount?: number;
    pendingFakeParticipantsRemoveCount?: number;
    searchString: string;
    setSearchString: (newValue: string) => void;
    showInviteButton?: boolean;
    sortedParticipantIds?: Array<string>;
}

/**
 * Renders the MeetingParticipantList component.
 * NOTE: This component is not using useSelector on purpose. The child components MeetingParticipantItem
 * and MeetingParticipantContextMenu are using connect. Having those mixed leads to problems.
 * When this one was using useSelector and the other two were not -the other two were re-rendered before this one was
 * re-rendered, so when participant is leaving, we first re-render the item and menu components,
 * throwing errors (closing the page) before removing those components for the participant that left.
 *
 * @returns {ReactNode} - The component.
 */
function MeetingParticipants({
    currentRoom,
    fakeParticipantsCount = 0,
    isModerator,
    overflowDrawer,
    participantsCount,
    pendingFakeParticipantsAddCount = 0,
    pendingFakeParticipantsRemoveCount = 0,
    searchString,
    setSearchString,
    showInviteButton,
    sortedParticipantIds = []
}: IProps) {
    const { t } = useTranslation();

    const [ lowerMenu, , toggleMenu, menuEnter, menuLeave, raiseContext ] = useContextMenu<string>();
    const [ drawerParticipant, closeDrawer, openDrawerForParticipant ] = useParticipantDrawer();

    // FIXME:
    // It seems that useTranslation is not very scalable. Unmount 500 components that have the useTranslation hook is
    // taking more than 10s. To workaround the issue we need to pass the texts as props. This is temporary and dirty
    // solution!!!
    // One potential proper fix would be to use react-window component in order to lower the number of components
    // mounted.
    const participantActionEllipsisLabel = t('participantsPane.actions.moreParticipantOptions');
    const youText = t('chat.you');
    const isBreakoutRoom = useSelector(isInBreakoutRoom);
    const _isCurrentRoomRenamable = useSelector(isCurrentRoomRenamable);
    const dispatch = useDispatch();

    const [ numFakeParticipants, setNumFakeParticipants ] = useState<string>('');

    const handleAddFakeParticipants = useCallback(() => {
        if (numFakeParticipants.trim() !== '') {
            dispatch(addFakeParticipants(numFakeParticipants));
            setNumFakeParticipants('');
        }
    }, [ dispatch, numFakeParticipants ]);

    const handleRemoveFakeParticipants = useCallback(() => {
        if (numFakeParticipants.trim() !== '') {
            dispatch(removeFakeParticipants(numFakeParticipants));
            setNumFakeParticipants('');
        }
    }, [ dispatch, numFakeParticipants ]);

    const handleRemoveAllFakeParticipants = useCallback(() => {
        dispatch(removeAllFakeParticipants());
        setNumFakeParticipants('');
    }, [ dispatch ]);

    const handleCancelPendingFakeParticipants = useCallback(() => {
        dispatch(cancelPendingFakeParticipants());
    }, [ dispatch ]);

    const hasPendingFakeOperations = pendingFakeParticipantsAddCount > 0 || pendingFakeParticipantsRemoveCount > 0;
    const statusParts: string[] = [];

    if (pendingFakeParticipantsAddCount > 0) {
        statusParts.push(`Adding ${pendingFakeParticipantsAddCount} left...`);
    }
    if (pendingFakeParticipantsRemoveCount > 0) {
        statusParts.push(`Removing ${pendingFakeParticipantsRemoveCount} left...`);
    }

    const { classes: styles } = useStyles();

    return (
        <>
            <span
                aria-level = { 1 }
                className = 'sr-only'
                role = 'heading'>
                { t('participantsPane.title') }
            </span>
            <div className = { styles.heading }>
                {currentRoom?.name
                    ? `${currentRoom.name} (${participantsCount})`
                    : t('participantsPane.headings.participantsList', { count: participantsCount })}
                { currentRoom?.name && _isCurrentRoomRenamable
                    && <RenameButton
                        breakoutRoomJid = { currentRoom?.jid }
                        name = { currentRoom?.name } /> }
            </div>
            {showInviteButton && <InviteButton />}
            {isModerator && (
                <div className = { styles.fakeParticipantsContainer }>
                    <Input
                        accessibilityLabel = 'Number of fake participants or comma separated names'
                        id = 'add-fake-participants-input'
                        onChange = { setNumFakeParticipants }
                        placeholder = 'Number or Names (e.g. 5 or Bob, Alice)'
                        type = 'text'
                        value = { numFakeParticipants } />
                    <div className = { styles.fakeParticipantsActions }>
                        <Button
                            accessibilityLabel = 'Add dummy participants'
                            className = { styles.fakeParticipantsActionBtn }
                            disabled = { numFakeParticipants.trim() === '' }
                            label = 'Add'
                            onClick = { handleAddFakeParticipants }
                            size = 'small'
                            type = { BUTTON_TYPES.PRIMARY } />
                        <Button
                            accessibilityLabel = 'Remove dummy participants'
                            className = { styles.fakeParticipantsActionBtn }
                            disabled = {
                                numFakeParticipants.trim() === ''
                                || (fakeParticipantsCount === 0 && pendingFakeParticipantsAddCount === 0)
                            }
                            label = 'Remove'
                            onClick = { handleRemoveFakeParticipants }
                            size = 'small'
                            type = { BUTTON_TYPES.SECONDARY } />
                    </div>
                    {fakeParticipantsCount > 0 && (
                        <Button
                            accessibilityLabel = 'Remove all dummy participants'
                            fullWidth = { true }
                            label = { `Remove All (${fakeParticipantsCount})` }
                            onClick = { handleRemoveAllFakeParticipants }
                            size = 'small'
                            type = { BUTTON_TYPES.DESTRUCTIVE } />
                    )}
                    {hasPendingFakeOperations && (
                        <div className = { styles.fakeParticipantsStatus }>
                            <span>{ statusParts.join(' • ') }</span>
                            <Button
                                accessibilityLabel = 'Stop pending dummy participant updates'
                                label = 'Stop'
                                onClick = { handleCancelPendingFakeParticipants }
                                size = 'small'
                                type = { BUTTON_TYPES.TERTIARY } />
                        </div>
                    )}
                </div>
            )}
            <Input
                accessibilityLabel = { t('participantsPane.search') }
                className = { styles.search }
                clearable = { true }
                hiddenDescription = { t('participantsPane.searchDescription') }
                id = 'participants-search-input'
                onChange = { setSearchString }
                placeholder = { t('participantsPane.search') }
                value = { searchString } />
            <div>
                <MeetingParticipantItems
                    isInBreakoutRoom = { isBreakoutRoom }
                    lowerMenu = { lowerMenu }
                    openDrawerForParticipant = { openDrawerForParticipant }
                    overflowDrawer = { overflowDrawer }
                    participantActionEllipsisLabel = { participantActionEllipsisLabel }
                    participantIds = { sortedParticipantIds }
                    raiseContextId = { raiseContext.entity }
                    searchString = { normalizeAccents(searchString) }
                    toggleMenu = { toggleMenu }
                    youText = { youText } />
            </div>
            <MeetingParticipantContextMenu
                closeDrawer = { closeDrawer }
                drawerParticipant = { drawerParticipant }
                offsetTarget = { raiseContext?.offsetTarget }
                onEnter = { menuEnter }
                onLeave = { menuLeave }
                onSelect = { lowerMenu }
                overflowDrawer = { overflowDrawer }
                participantID = { raiseContext?.entity } />
        </>
    );
}

/**
 * Maps (parts of) the redux state to the associated props for this component.
 *
 * @param {Object} state - The Redux state.
 * @param {Object} ownProps - The own props of the component.
 * @private
 * @returns {IProps}
 */
function _mapStateToProps(state: IReduxState) {
    let sortedParticipantIds: any = getSortedParticipantIds(state);
    const _iAmVisitor = iAmVisitor(state);

    // Filter out the virtual screenshare participants since we do not want them to be displayed as separate
    // participants in the participants pane.
    // Filter local participant when in visitor mode
    sortedParticipantIds = sortedParticipantIds.filter((id: any) => {
        const participant = getParticipantById(state, id);

        if (_iAmVisitor && participant?.local) {
            return false;
        }

        return !isScreenShareParticipant(participant);
    });

    const participantsCount = sortedParticipantIds.length;
    const showInviteButton = shouldRenderInviteButton(state) && isButtonEnabled('invite', state);
    const overflowDrawer = showOverflowDrawer(state);
    const currentRoomId = getCurrentRoomId(state);
    const currentRoom = getBreakoutRooms(state)[currentRoomId];

    const {
        pendingFakeParticipantsAddCount = 0,
        pendingFakeParticipantsRemoveCount = 0
    } = state['features/base/participants'];

    return {
        currentRoom,
        fakeParticipantsCount: getLoadTestFakeParticipantsCount(state),
        isModerator: isLocalParticipantModerator(state),
        overflowDrawer,
        participantsCount,
        pendingFakeParticipantsAddCount,
        pendingFakeParticipantsRemoveCount,
        showInviteButton,
        sortedParticipantIds
    };
}

export default connect(_mapStateToProps)(MeetingParticipants);
