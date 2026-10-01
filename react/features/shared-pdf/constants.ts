/**
 * The command used for shared PDF over the data channel/XMPP.
 */
export const SHARED_PDF = 'shared-pdf';

/**
 * The default size limit for a shared PDF in bytes (100 MB).
 */
export const MAX_SHARED_PDF_SIZE = 100 * 1024 * 1024;

/**
 * The name of the fake participant used for the shared PDF.
 */
export const SHARED_PDF_PARTICIPANT_NAME = 'Shared PDF';

/**
 * Shared PDF statuses.
 */
export const PDF_STATUS = {
    OPEN: 'open',
    STOP: 'stop'
};
