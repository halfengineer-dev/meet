import { SharedBrowserButton } from './components';

const sharedBrowser = {
    key: 'sharedbrowser',
    Content: SharedBrowserButton,
    group: 3
};

/**
 * A hook that returns the shared browser button if it is enabled and undefined otherwise.
 *
 *  @returns {Object | undefined}
 */
export function useSharedBrowserButton() {
    return sharedBrowser;
}
