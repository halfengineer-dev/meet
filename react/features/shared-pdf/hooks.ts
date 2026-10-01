import { useSelector } from 'react-redux';

import SharedPdfButton from './components/SharedPdfButton';
import { isSharedPdfEnabled } from './functions';

const sharePdf = {
    key: 'sharedpdf',
    Content: SharedPdfButton,
    group: 3
};

/**
 * A hook that returns the shared PDF button if it is enabled and undefined otherwise.
 *
 *  @returns {Object | undefined}
 */
export function useSharedPdfButton() {
    const sharedPdfEnabled = useSelector(isSharedPdfEnabled);

    if (sharedPdfEnabled) {
        return sharePdf;
    }
}
