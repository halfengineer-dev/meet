import ChatButton from './components/web/ChatButton';

interface IChatButtonEntry {
    Content: typeof ChatButton;
    group: number;
    key: string;
}

/**
 * A hook that returns the chat button if chat is not disabled.
 *
 * @returns {Object | undefined} - The chat button object or undefined.
 */
export function useChatButton(): IChatButtonEntry | undefined {
    return undefined;
}
