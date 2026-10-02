import React, { useEffect, useState } from 'react';
import { connect, useDispatch } from 'react-redux';
import { Document, Page, pdfjs } from 'react-pdf';

// This is required to set up the worker for pdf.js
// We can use the unpkg cdn for the worker to avoid webpack config issues for now
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

import { IReduxState } from '../../app/types';
import { getLocalParticipant } from '../../base/participants/functions';
import { PDF_STATUS } from '../constants';
import { updateLocalSharedPdfState, resetSharedPdfStatus, togglePdfFollowPresenter } from '../actions';
import { isPdfSharing, sendSharePdfCommand } from '../functions';
import { getCurrentConference } from '../../base/conference/functions';

interface IProps {
    documentUrl?: string;
    documentId?: string;
    isSharing: boolean;
    isOwner: boolean;
    presenterPage: number;
    presenterZoom: number;
    presenterRotation: number;
    localPage: number;
    localZoom: number;
    localRotation: number;
    followPresenter: boolean;
    localParticipantId: string;
    conference: any;
}

/**
 * Implements a React component for rendering a PDF document.
 */
function SharedPdf(props: IProps) {
    const {
        documentUrl,
        documentId,
        isSharing,
        isOwner,
        presenterPage,
        presenterZoom,
        presenterRotation,
        localPage,
        localZoom,
        localRotation,
        followPresenter,
        localParticipantId,
        conference
    } = props;

    const dispatch = useDispatch();
    const [numPages, setNumPages] = useState<number | null>(null);

    // Sync local state with presenter state if followPresenter is true
    useEffect(() => {
        if (followPresenter && !isOwner) {
            if (localPage !== presenterPage || localZoom !== presenterZoom || localRotation !== presenterRotation) {
                dispatch(updateLocalSharedPdfState({
                    page: presenterPage,
                    zoom: presenterZoom,
                    rotation: presenterRotation
                }));
            }
        }
    }, [followPresenter, presenterPage, presenterZoom, presenterRotation, isOwner, localPage, localZoom, localRotation, dispatch]);

    if (!isSharing || !documentUrl) {
        return null;
    }

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const handlePageChange = (newPage: number) => {
        dispatch(updateLocalSharedPdfState({ page: newPage }));
    };

    const handleZoomChange = (newZoom: number) => {
        dispatch(updateLocalSharedPdfState({ zoom: newZoom }));
    };

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#2a2a2a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            overflow: 'auto',
            zIndex: 10
        }}>
            <Document
                file={documentUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                    <div style={{ color: 'white', marginTop: '40px' }}>Loading PDF...</div>
                }
            >
                <Page
                    pageNumber={localPage}
                    scale={localZoom}
                    rotate={localRotation}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                />
            </Document>
            {/* Minimal controls for demonstration, in a real implementation we'd add toolbar buttons */}
            <div style={{
                position: 'fixed',
                bottom: 20,
                backgroundColor: 'rgba(0,0,0,0.8)',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                display: 'flex',
                gap: '15px',
                alignItems: 'center',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                zIndex: 20
            }}>
                <button 
                    onClick={() => handlePageChange(Math.max(localPage - 1, 1))}
                    disabled={localPage <= 1}
                    style={controlButtonStyle}
                >
                    Prev
                </button>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Page {localPage} of {numPages ?? '--'}</span>
                <button 
                    onClick={() => handlePageChange(Math.min(localPage + 1, numPages ?? localPage))}
                    disabled={numPages !== null && localPage >= numPages}
                    style={controlButtonStyle}
                >
                    Next
                </button>
                <div style={{ width: '1px', height: '20px', backgroundColor: '#555', margin: '0 5px' }} />
                <button onClick={() => handleZoomChange(localZoom + 0.25)} style={controlButtonStyle}>Zoom In</button>
                <button onClick={() => handleZoomChange(Math.max(localZoom - 0.25, 0.25))} style={controlButtonStyle}>Zoom Out</button>
                <div style={{ width: '1px', height: '20px', backgroundColor: '#555', margin: '0 5px' }} />
                {!isOwner && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={followPresenter} 
                            onChange={() => dispatch(togglePdfFollowPresenter())} 
                        />
                        Follow Presenter
                    </label>
                )}
            </div>
        </div>
    );
}

const controlButtonStyle = {
    backgroundColor: '#444',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px'
};

function mapStateToProps(state: IReduxState) {
    const sharedPdfState = state['features/shared-pdf'];
    const localParticipant = getLocalParticipant(state);

    return {
        isSharing: sharedPdfState?.status === PDF_STATUS.OPEN,
        documentUrl: sharedPdfState?.documentUrl,
        documentId: sharedPdfState?.documentId,
        isOwner: sharedPdfState?.ownerId === localParticipant?.id,
        presenterPage: sharedPdfState?.presenterPage ?? 1,
        presenterZoom: sharedPdfState?.presenterZoom ?? 1.0,
        presenterRotation: sharedPdfState?.presenterRotation ?? 0,
        localPage: sharedPdfState?.localPage ?? 1,
        localZoom: sharedPdfState?.localZoom ?? 1.0,
        localRotation: sharedPdfState?.localRotation ?? 0,
        followPresenter: sharedPdfState?.followPresenter ?? true,
        localParticipantId: localParticipant?.id ?? '',
        conference: getCurrentConference(state)
    };
}

export default connect(mapStateToProps)(SharedPdf);
