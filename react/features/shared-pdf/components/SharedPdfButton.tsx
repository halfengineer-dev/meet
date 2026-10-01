import React from 'react';
import { connect } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';

import { IReduxState } from '../../app/types';
import { translate } from '../../base/i18n/functions';
import { IconShareDoc } from '../../base/icons/svg';
import { getLocalParticipant } from '../../base/participants/functions';
import AbstractButton, { IProps as AbstractButtonProps } from '../../base/toolbox/components/AbstractButton';
import { showErrorNotification } from '../../notifications/actions';
import { NOTIFICATION_TIMEOUT_TYPE, NOTIFICATION_TYPE } from '../../notifications/constants';

import { MAX_SHARED_PDF_SIZE, PDF_STATUS } from '../constants';
import { isPdfSharing, sendSharePdfCommand } from '../functions';
import { setSharedPdfStatus } from '../actions';

interface IProps extends AbstractButtonProps {
    _isDisabled: boolean;
    _sharingPdf: boolean;
    _isOwner: boolean;
    _conference: any;
    _localParticipantId: string;
}

/**
 * Implements an {@link AbstractButton} to open or close the Shared PDF feature.
 * Works locally — reads PDF as a data URL so no backend file hosting is required.
 */
class SharedPdfButton extends AbstractButton<IProps> {
    override accessibilityLabel = 'toolbar.accessibilityLabel.sharedpdf';
    override toggledAccessibilityLabel = 'toolbar.accessibilityLabel.stopSharedPdf';
    override icon = IconShareDoc;
    override label = 'toolbar.sharedPdf';
    override toggledLabel = 'toolbar.stopSharedPdf';
    override tooltip = 'toolbar.sharedPdf';
    override toggledTooltip = 'toolbar.stopSharedPdf';

    private fileInputRef: React.RefObject<HTMLInputElement>;

    constructor(props: IProps) {
        super(props);
        this.fileInputRef = React.createRef();
        this._onFileChange = this._onFileChange.bind(this);
    }

    override _handleClick() {
        if (this.props._sharingPdf) {
            if (this.props._isOwner) {
                const state = this.props.store?.getState?.()
                    ?? (this.props as any)._store?.getState?.();
                const documentId = state?.['features/shared-pdf']?.documentId ?? '';

                // Stop sharing
                sendSharePdfCommand({
                    conference: this.props._conference,
                    documentId,
                    localParticipantId: this.props._localParticipantId,
                    status: PDF_STATUS.STOP
                });
            } else {
                this.props.dispatch(showErrorNotification({
                    titleKey: 'sharedPdf.alreadySharing',
                    appearance: NOTIFICATION_TYPE.ERROR
                }, NOTIFICATION_TIMEOUT_TYPE.SHORT));
            }
        } else {
            // Trigger file picker
            this.fileInputRef.current?.click();
        }
    }

    override _isToggled() {
        return this.props._sharingPdf;
    }

    override _isDisabled() {
        return this.props._isDisabled;
    }

    private _onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];

        if (!file) {
            return;
        }

        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            this.props.dispatch(showErrorNotification({
                titleKey: 'sharedPdf.invalidPdf',
                appearance: NOTIFICATION_TYPE.ERROR
            }, NOTIFICATION_TIMEOUT_TYPE.SHORT));
            return;
        }

        if (file.size > MAX_SHARED_PDF_SIZE) {
            this.props.dispatch(showErrorNotification({
                titleKey: 'sharedPdf.fileTooLarge',
                appearance: NOTIFICATION_TYPE.ERROR
            }, NOTIFICATION_TIMEOUT_TYPE.STICKY));
            return;
        }

        this._loadPdfLocally(file);

        e.target.value = '';
    }

    /**
     * Reads the PDF file as a data URL and dispatches the sharing command.
     * No backend upload required — the PDF is stored in-memory as a blob URL.
     */
    private _loadPdfLocally(file: File) {
        const conference = this.props._conference;
        const localParticipantId = this.props._localParticipantId;
        const documentId = uuidv4();

        const reader = new FileReader();

        reader.onload = () => {
            const dataUrl = reader.result as string;

            // Store the data URL in Redux so SharedPdf component can render it
            this.props.dispatch(setSharedPdfStatus({
                documentId,
                documentUrl: dataUrl,
                status: PDF_STATUS.OPEN,
                ownerId: localParticipantId,
                page: 1,
                zoom: 1.0,
                scrollX: 0,
                scrollY: 0,
                rotation: 0,
                presenterMode: true
            }));

            // Send XMPP command to notify other participants
            // Note: the data URL is NOT sent over XMPP (too large).
            // For V1, only the presenter sees the PDF. Multi-participant
            // file transfer will be added in a future version.
            sendSharePdfCommand({
                conference,
                documentId,
                documentUrl: `local://${documentId}`,
                localParticipantId,
                status: PDF_STATUS.OPEN,
                page: 1,
                zoom: 1.0,
                scrollX: 0,
                scrollY: 0,
                rotation: 0,
                presenterMode: true
            });
        };

        reader.onerror = () => {
            console.error('Failed to read PDF file');
            this.props.dispatch(showErrorNotification({
                titleKey: 'sharedPdf.readError',
                appearance: NOTIFICATION_TYPE.ERROR
            }, NOTIFICATION_TIMEOUT_TYPE.STICKY));
        };

        reader.readAsDataURL(file);
    }

    override render() {
        return (
            <>
                {super.render()}
                <input
                    accept='application/pdf,.pdf'
                    onChange={this._onFileChange}
                    ref={this.fileInputRef}
                    style={{ display: 'none' }}
                    type='file' />
            </>
        );
    }
}

function _mapStateToProps(state: IReduxState) {
    const { ownerId } = state['features/shared-pdf'];
    const localParticipantId = getLocalParticipant(state)?.id;
    const sharingPdf = isPdfSharing(state);

    return {
        _isDisabled: sharingPdf && ownerId !== localParticipantId,
        _sharingPdf: sharingPdf,
        _isOwner: sharingPdf && ownerId === localParticipantId,
        _conference: state['features/base/conference'].conference,
        _localParticipantId: localParticipantId ?? ''
    };
}

export default translate(connect(_mapStateToProps)(SharedPdfButton));
