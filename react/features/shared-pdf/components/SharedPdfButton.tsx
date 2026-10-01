import React from 'react';
import { connect } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';

import { IReduxState } from '../../app/types';
import { translate } from '../../base/i18n/functions';
import { IconShareDoc } from '../../base/icons/svg';
import { getLocalParticipant } from '../../base/participants/functions';
import AbstractButton, { IProps as AbstractButtonProps } from '../../base/toolbox/components/AbstractButton';
import { showErrorNotification, showSuccessNotification } from '../../notifications/actions';
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
    _fileSharingConfig: any;
}

/**
 * Implements an {@link AbstractButton} to open or close the Shared PDF feature.
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
                // Stop sharing
                sendSharePdfCommand({
                    conference: this.props._conference,
                    documentId: '',
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

        const maxFileSize = this.props._fileSharingConfig?.maxFileSize ?? MAX_SHARED_PDF_SIZE;

        if (file.size > maxFileSize) {
            this.props.dispatch(showErrorNotification({
                titleKey: 'fileSharing.fileTooLargeTitle',
                appearance: NOTIFICATION_TYPE.ERROR
            }, NOTIFICATION_TIMEOUT_TYPE.STICKY));
            return;
        }

        this._uploadPdf(file);
        
        e.target.value = '';
    }

    private async _uploadPdf(file: File) {
        const conference = this.props._conference;
        const sessionId = conference?.getMeetingUniqueId();
        const apiUrl = this.props._fileSharingConfig?.apiUrl;
        const localParticipantId = this.props._localParticipantId;

        if (!apiUrl || !sessionId) {
            return;
        }

        try {
            const token = await conference?.getShortTermCredentials(conference?.getFileSharing()?.getIdentityType());
            
            const fileId = uuidv4();
            const formData = new FormData();
            
            const fileMetadata = {
                authorParticipantId: localParticipantId,
                fileId,
                fileName: file.name,
                fileSize: file.size,
                fileType: 'pdf',
                timestamp: Date.now()
            };
            
            formData.append('metadata', JSON.stringify(fileMetadata));
            formData.append('file', file);

            const response = await fetch(`${apiUrl}/sessions/${sessionId}/files`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            this.props.dispatch(showSuccessNotification({
                titleKey: 'sharedPdf.uploadSuccess'
            }, NOTIFICATION_TIMEOUT_TYPE.SHORT));

            const documentUrl = `${apiUrl}/sessions/${sessionId}/files/${fileId}`;
            
            sendSharePdfCommand({
                conference,
                documentId: fileId,
                documentUrl,
                localParticipantId,
                status: PDF_STATUS.OPEN,
                page: 1,
                zoom: 1.0,
                scrollX: 0,
                scrollY: 0,
                rotation: 0,
                presenterMode: true
            });

        } catch (error) {
            console.error('Failed to upload PDF:', error);
            this.props.dispatch(showErrorNotification({
                titleKey: 'fileSharing.uploadFailedTitle',
                appearance: NOTIFICATION_TYPE.ERROR
            }, NOTIFICATION_TIMEOUT_TYPE.STICKY));
        }
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
        _localParticipantId: localParticipantId ?? '',
        _fileSharingConfig: state['features/base/config'].fileSharing
    };
}

export default translate(connect(_mapStateToProps)(SharedPdfButton));
