import React from 'react';
import { connect } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';

import { IReduxState } from '../../app/types';
import { translate } from '../../base/i18n/functions';
import { IconShareDoc } from '../../base/icons/svg';
import { getLocalParticipant } from '../../base/participants/functions';
import { participantJoined, participantLeft, pinParticipant } from '../../base/participants/actions';
import { FakeParticipant } from '../../base/participants/types';
import { getCurrentConference } from '../../base/conference/functions';
import AbstractButton, { IProps as AbstractButtonProps } from '../../base/toolbox/components/AbstractButton';
import { showErrorNotification } from '../../notifications/actions';
import { NOTIFICATION_TIMEOUT_TYPE, NOTIFICATION_TYPE } from '../../notifications/constants';

import { MAX_SHARED_PDF_SIZE, PDF_STATUS, SHARED_PDF_PARTICIPANT_NAME } from '../constants';
import { isPdfSharing } from '../functions';
import { setSharedPdfStatus, resetSharedPdfStatus } from '../actions';

interface IProps extends AbstractButtonProps {
    _isDisabled: boolean;
    _sharingPdf: boolean;
    _isOwner: boolean;
    _conference: any;
    _localParticipantId: string;
    _documentId: string;
}

/**
 * Implements an {@link AbstractButton} to open or close the Shared PDF feature.
 * Works locally — reads PDF as a blob URL so no backend file hosting is required.
 */
class SharedPdfButton extends AbstractButton<IProps> {
    override accessibilityLabel = 'toolbar.accessibilityLabel.sharedpdf';
    override toggledAccessibilityLabel = 'toolbar.accessibilityLabel.stopSharedPdf';
    override icon = IconShareDoc;
    override label = 'toolbar.sharedPdf';
    override toggledLabel = 'toolbar.stopSharedPdf';
    override tooltip = 'toolbar.sharedPdf';
    override toggledTooltip = 'toolbar.stopSharedPdf';

    constructor(props: IProps) {
        super(props);
    }

    override _handleClick() {
        if (this.props._sharingPdf) {
            if (this.props._isOwner) {
                const { _documentId, _conference } = this.props;
                if (_documentId && _conference) {
                    this.props.dispatch(participantLeft(_documentId, _conference));
                }
                this.props.dispatch(resetSharedPdfStatus());
            } else {
                this.props.dispatch(showErrorNotification({
                    titleKey: 'sharedPdf.alreadySharing',
                    appearance: NOTIFICATION_TYPE.ERROR
                }, NOTIFICATION_TIMEOUT_TYPE.SHORT));
            }
        } else {
            console.log("PDF DEBUG: Share PDF button clicked!");
            // Create a dynamic input element and append it to body to ensure it's not GC'd
            // and that events fire correctly across all browsers.
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/pdf,.pdf';
            input.style.display = 'none';
            document.body.appendChild(input);
            
            input.onchange = (e: any) => {
                console.log("PDF DEBUG: onchange fired on dynamic input!");
                const file = e.target.files?.[0];
                if (file) {
                    console.log("PDF DEBUG: File received:", file.name, file.size);
                    this._processFile(file);
                }
                document.body.removeChild(input);
            };
            
            console.log("PDF DEBUG: Invoking input.click()...");
            input.click();
        }
    }

    override _isToggled() {
        return this.props._sharingPdf;
    }

    override _isDisabled() {
        return this.props._isDisabled;
    }

    private _processFile(file: File) {
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

        this._uploadPdfAndShare(file);
    }

    /**
     * Uploads the PDF to the Cloudflare Worker and shares the resulting URL.
     */
    private async _uploadPdfAndShare(file: File) {
        const localParticipantId = this.props._localParticipantId;
        // @ts-ignore
        const conference = this.props._conference || (typeof APP !== 'undefined' ? APP.conference : undefined);
        const documentId = uuidv4();

        console.log("PDF DEBUG: Uploading to Cloudflare...");
        let documentUrl = '';

        try {
            const response = await fetch('https://pdf-uploader.souravdubey754.workers.dev/upload', {
                method: 'POST',
                body: file,
                headers: {
                    'Content-Type': 'application/pdf'
                }
            });

            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}`);
            }

            const data = await response.json();
            documentUrl = data.url;
            console.log("PDF DEBUG: Upload successful, URL:", documentUrl);
        } catch (error) {
            console.error("PDF DEBUG: Upload error:", error);
            this.props.dispatch(showErrorNotification({
                titleKey: 'dialog.error', // generic error
                appearance: NOTIFICATION_TYPE.ERROR
            }, NOTIFICATION_TIMEOUT_TYPE.STICKY));
            return;
        }

        // 1. Create a fake participant for the PDF (so it shows in the large video area)
        this.props.dispatch(participantJoined({
            conference,
            fakeParticipant: FakeParticipant.SharedPdf,
            id: documentId,
            name: SHARED_PDF_PARTICIPANT_NAME
        }));
        console.log("PDF DEBUG: dispatched participantJoined");

        // 2. Pin the PDF participant so it takes over the large video area
        this.props.dispatch(pinParticipant(documentId));
        console.log("PDF DEBUG: dispatched pinParticipant");

        // 3. Set the shared PDF status with the Cloudflare URL
        this.props.dispatch(setSharedPdfStatus({
            documentId,
            documentUrl,
            status: PDF_STATUS.OPEN,
            ownerId: localParticipantId,
            page: 1,
            zoom: 1.0,
            scrollX: 0,
            scrollY: 0,
            rotation: 0,
            presenterMode: true
        }));
        console.log("PDF DEBUG: dispatched setSharedPdfStatus");
    }

    override render() {
        return super.render();
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
        _conference: state['features/base/conference'].conference || (typeof APP !== 'undefined' ? APP.conference : undefined),
        _localParticipantId: localParticipantId ?? '',
        _documentId: state['features/shared-pdf']?.documentId ?? ''
    };
}

export default translate(connect(_mapStateToProps)(SharedPdfButton));
