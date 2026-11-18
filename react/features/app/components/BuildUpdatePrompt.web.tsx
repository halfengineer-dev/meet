import React, { useCallback, useEffect, useRef, useState } from 'react';
import { makeStyles } from 'tss-react/mui';

declare const __DEV__: boolean | undefined;
declare const __FACEONN_BUILD_VERSION__: string | undefined;

const VERSION_ENDPOINT = '/libs/version.json';
const POLL_INTERVAL_MS = 60 * 1000; // Check every 60 seconds while open
const MIN_CHECK_GAP_MS = 15 * 1000; // Throttle tab focus / visibility checks
const DISMISS_SNOOZE_MS = 5 * 60 * 1000; // Re-remind after 5 minutes if user clicks "Later"
const CACHE_RELOAD_TIMEOUT_MS = 5000;
const REFRESH_QUERY_PARAM = '_refresh';

const useStyles = makeStyles()(() => {
    return {
        container: {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 999999,
            maxWidth: '380px',
            width: 'calc(100vw - 32px)',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            color: '#f8fafc',
            borderRadius: '16px',
            border: '1px solid rgba(129, 140, 248, 0.4)',
            boxShadow: '0 20px 45px rgba(2, 6, 23, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06)',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            backdropFilter: 'blur(12px)'
        },

        header: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
        },

        iconWrap: {
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
        },

        textWrap: {
            flex: 1,
            minWidth: 0
        },

        title: {
            margin: '0 0 4px 0',
            fontSize: '15px',
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.3
        },

        message: {
            margin: 0,
            fontSize: '13px',
            color: '#cbd5e1',
            lineHeight: 1.45
        },

        actions: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px'
        },

        laterBtn: {
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            color: '#e2e8f0',
            borderRadius: '10px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s ease',

            '&:hover:not(:disabled)': {
                background: 'rgba(255, 255, 255, 0.16)'
            },

            '&:disabled': {
                opacity: 0.6,
                cursor: 'not-allowed'
            }
        },

        refreshBtn: {
            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
            border: 'none',
            color: '#ffffff',
            borderRadius: '10px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
            transition: 'transform 0.15s ease, opacity 0.15s ease',

            '&:hover:not(:disabled)': {
                transform: 'translateY(-1px)'
            },

            '&:disabled': {
                opacity: 0.75,
                cursor: 'wait'
            }
        }
    };
});

/**
 * Forces the browser to purge Cache Storage, unregister any Service Workers,
 * revalidate all currently loaded same-origin HTML/JS/CSS assets with `cache: 'reload'`,
 * and navigate cleanly with a cache-busting query parameter.
 *
 * @param {string} targetVersion - The newly detected server build version.
 * @returns {Promise<void>}
 */
async function performHardRefresh(targetVersion: string): Promise<void> {
    try {
        // 1. Purge Cache Storage API (if present)
        if ('caches' in window) {
            const cacheNames = await window.caches.keys();

            await Promise.all(cacheNames.map(name => window.caches.delete(name)));
        }
    } catch (_) {
        // Ignore storage errors
    }

    try {
        // 2. Unregister any Service Workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();

            await Promise.all(registrations.map(reg => reg.unregister()));
        }
    } catch (_) {
        // Ignore service worker errors
    }

    try {
        // 3. Revalidate HTML + loaded same-origin scripts and stylesheets to overwrite HTTP disk cache
        const origin = window.location.origin;
        const urlsToRevalidate = new Set<string>([ window.location.href ]);

        if (window.location.pathname !== '/') {
            urlsToRevalidate.add(`${origin}/`);
        }

        document.querySelectorAll('script[src]').forEach(el => {
            const src = (el as HTMLScriptElement).src;

            if (src?.startsWith(origin)) {
                urlsToRevalidate.add(src);
            }
        });

        document.querySelectorAll('link[rel="stylesheet"][href]').forEach(el => {
            const href = (el as HTMLLinkElement).href;

            if (href?.startsWith(origin)) {
                urlsToRevalidate.add(href);
            }
        });

        const revalidatePromise = Promise.all(
            Array.from(urlsToRevalidate).map(url =>
                fetch(url, {
                    cache: 'reload',
                    credentials: 'same-origin'
                }).catch(() => undefined)
            )
        );

        await Promise.race([
            revalidatePromise,
            new Promise(resolve => setTimeout(resolve, CACHE_RELOAD_TIMEOUT_MS))
        ]);
    } catch (_) {
        // Proceed with navigation even if revalidation fails
    }

    // 4. Perform top-level cache-busted navigation (more reliable than location.reload())
    const nextUrl = new URL(window.location.href);

    nextUrl.searchParams.set(REFRESH_QUERY_PARAM, targetVersion || String(Date.now()));
    window.location.replace(nextUrl.toString());
}

/**
 * Monitors `/libs/version.json` against the build version baked into the active JS bundle.
 * When a newer build is deployed, displays a prompt allowing the user to hard-refresh
 * and clear cached assets automatically.
 *
 * @returns {React.ReactElement | null}
 */
export default function BuildUpdatePrompt() {
    const { classes } = useStyles();
    const [ availableVersion, setAvailableVersion ] = useState<string | null>(null);
    const [ dismissedUntil, setDismissedUntil ] = useState<number>(0);
    const [ isRefreshing, setIsRefreshing ] = useState<boolean>(false);
    const lastCheckRef = useRef<number>(0);

    const currentVersion = typeof __FACEONN_BUILD_VERSION__ === 'string'
        ? __FACEONN_BUILD_VERSION__
        : '';
    const isDev = typeof __DEV__ !== 'undefined' && Boolean(__DEV__);

    // Strip the temporary ?_refresh= query param once the newly loaded build boots
    useEffect(() => {
        try {
            const url = new URL(window.location.href);

            if (url.searchParams.has(REFRESH_QUERY_PARAM)) {
                url.searchParams.delete(REFRESH_QUERY_PARAM);
                const cleaned = `${url.pathname}${url.search}${url.hash}`;

                window.history.replaceState({}, document.title, cleaned || '/');
            }
        } catch (_) {
            // Ignore URL parsing issues
        }
    }, []);

    const checkForUpdate = useCallback(async (force = false) => {
        if (isDev || !currentVersion) {
            return;
        }

        const now = Date.now();

        if (!force && now - lastCheckRef.current < MIN_CHECK_GAP_MS) {
            return;
        }
        lastCheckRef.current = now;

        try {
            const response = await fetch(`${VERSION_ENDPOINT}?_t=${now}`, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    Pragma: 'no-cache'
                }
            });

            if (!response.ok) {
                return;
            }

            const data = await response.json();
            const remoteVersion = typeof data?.version === 'string' ? data.version.trim() : '';

            if (remoteVersion && remoteVersion !== currentVersion) {
                setAvailableVersion(remoteVersion);
            }
        } catch (_) {
            // Silently ignore transient network/offline errors
        }
    }, [ currentVersion, isDev ]);

    useEffect(() => {
        if (isDev || !currentVersion) {
            return undefined;
        }

        // Check immediately when the user opens the website
        checkForUpdate(true);

        const intervalId = window.setInterval(() => {
            checkForUpdate(false);
        }, POLL_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkForUpdate(false);
            }
        };

        const handleFocus = () => {
            checkForUpdate(false);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [ checkForUpdate, currentVersion, isDev ]);

    const handleRefreshClick = useCallback(() => {
        if (isRefreshing) {
            return;
        }
        setIsRefreshing(true);
        performHardRefresh(availableVersion || String(Date.now()));
    }, [ availableVersion, isRefreshing ]);

    const handleDismissClick = useCallback(() => {
        setDismissedUntil(Date.now() + DISMISS_SNOOZE_MS);
    }, []);

    useEffect(() => {
        if (!dismissedUntil) {
            return undefined;
        }
        const remaining = dismissedUntil - Date.now();

        if (remaining <= 0) {
            setDismissedUntil(0);

            return undefined;
        }

        const timerId = window.setTimeout(() => {
            setDismissedUntil(0);
        }, remaining);

        return () => window.clearTimeout(timerId);
    }, [ dismissedUntil ]);

    if (!availableVersion || Date.now() < dismissedUntil) {
        return null;
    }

    return (
        <div
            aria-live = 'polite'
            className = { classes.container }
            role = 'alertdialog'>
            <div className = { classes.header }>
                <div className = { classes.iconWrap }>
                    <svg
                        fill = 'none'
                        height = '18'
                        stroke = 'currentColor'
                        strokeLinecap = 'round'
                        strokeLinejoin = 'round'
                        strokeWidth = '2.2'
                        viewBox = '0 0 24 24'
                        width = '18'>
                        <polyline points = '23 4 23 10 17 10' />
                        <polyline points = '1 20 1 14 7 14' />
                        <path d = 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' />
                    </svg>
                </div>
                <div className = { classes.textWrap }>
                    <h4 className = { classes.title }>New Update Available</h4>
                    <p className = { classes.message }>
                        A newer version of Faceonn is live. Refresh now to clear cached files and load the latest updates.
                    </p>
                </div>
            </div>
            <div className = { classes.actions }>
                <button
                    className = { classes.laterBtn }
                    disabled = { isRefreshing }
                    onClick = { handleDismissClick }
                    type = 'button'>
                    Later
                </button>
                <button
                    className = { classes.refreshBtn }
                    disabled = { isRefreshing }
                    onClick = { handleRefreshClick }
                    type = 'button'>
                    {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
                </button>
            </div>
        </div>
    );
}
