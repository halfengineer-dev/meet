import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { Document, Page, pdfjs } from 'react-pdf';

// This is required to set up the worker for pdf.js
// We can use the unpkg cdn for the worker to avoid webpack config issues for now
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

import { IReduxState } from '../../app/types';
import { getLocalParticipant } from '../../base/participants/functions';
import { PDF_STATUS } from '../constants';
import { updateLocalSharedPdfState } from '../actions';
import { isPdfSharing } from '../functions';

interface IProps {
    documentUrl?: string;
    isSharing: boolean;
    presenterPage: number;
    presenterZoom: number;
    presenterRotation: number;
    localPage: number;
    localZoom: number;
    localRotation: number;
    followPresenter: boolean;
    dispatch: Function;
}

/**
 * Implements a React component for rendering a PDF document.
 */
function SharedPdf(props: IProps) {
    const {
        documentUrl,
        isSharing,
        presenterPage,
        presenterZoom,
        presenterRotation,
        localPage,
        localZoom,
        localRotation,
        followPresenter,
        dispatch
    } = props;

    const [numPages, setNumPages] = useState<number | null>(null);

    // Sync local state with presenter state if followPresenter is true
    useEffect(() => {
        if (followPresenter) {
            if (localPage !== presenterPage || localZoom !== presenterZoom || localRotation !== presenterRotation) {
                dispatch(updateLocalSharedPdfState({
                    page: presenterPage,
                    zoom: presenterZoom,
                    rotation: presenterRotation
                }));
            }
        }
    }, [followPresenter, presenterPage, presenterZoom, presenterRotation]);

    if (!isSharing || !documentUrl) {
        return null;
    }

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            overflow: 'auto',
            zIndex: 10
        }}>
            <Document
                file={documentUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading="Loading PDF..."
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
                position: 'absolute',
                bottom: 20,
                backgroundColor: 'rgba(0,0,0,0.5)',
                color: 'white',
                padding: '10px',
                borderRadius: '5px',
                display: 'flex',
                gap: '10px'
            }}>
                <button 
                    onClick={() => dispatch(updateLocalSharedPdfState({ page: Math.max(localPage - 1, 1) }))}
                    disabled={localPage <= 1}
                >
                    Prev
                </button>
                <span>Page {localPage} of {numPages ?? '--'}</span>
                <button 
                    onClick={() => dispatch(updateLocalSharedPdfState({ page: Math.min(localPage + 1, numPages ?? localPage) }))}
                    disabled={numPages !== null && localPage >= numPages}
                >
                    Next
                </button>
                <button onClick={() => dispatch(updateLocalSharedPdfState({ zoom: localZoom + 0.25 }))}>Zoom In</button>
                <button onClick={() => dispatch(updateLocalSharedPdfState({ zoom: Math.max(localZoom - 0.25, 0.25) }))}>Zoom Out</button>
                <button onClick={() => dispatch(updateLocalSharedPdfState({ rotation: (localRotation + 90) % 360 }))}>Rotate</button>
                <label>
                    <input 
                        type="checkbox" 
                        checked={followPresenter} 
                        onChange={(e) => dispatch(updateLocalSharedPdfState({ followPresenter: e.target.checked }))} 
                    />
                    Follow Presenter
                </label>
            </div>
        </div>
    );
}

function mapStateToProps(state: IReduxState) {
    const sharedPdfState = state['features/shared-pdf'];
    return {
        isSharing: isPdfSharing(state),
        documentUrl: sharedPdfState.documentUrl,
        presenterPage: sharedPdfState.presenterPage ?? 1,
        presenterZoom: sharedPdfState.presenterZoom ?? 1.0,
        presenterRotation: sharedPdfState.presenterRotation ?? 0,
        localPage: sharedPdfState.localPage ?? 1,
        localZoom: sharedPdfState.localZoom ?? 1.0,
        localRotation: sharedPdfState.localRotation ?? 0,
        followPresenter: sharedPdfState.followPresenter
    };
}

export default connect(mapStateToProps)(SharedPdf);
