import React, { Component } from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';

import { IReduxState, IStore } from '../../../app/types';
import { getCurrentConference } from '../../../base/conference/functions';
import { getLocalParticipant, getParticipantById } from '../../../base/participants/functions';
import { FakeParticipant } from '../../../base/participants/types';
import { getVerticalViewMaxWidth } from '../../../filmstrip/functions.web';
import { getLargeVideoParticipant } from '../../../large-video/functions';
import { getToolboxHeight } from '../../../toolbox/functions.web';
import { setSharedBrowserState } from '../../actions';
import { sendSharedBrowserCommand, normalizeUrl, validateBrowserUrl, isBrowserShared } from '../../functions';
import { BROWSER_EVENTS } from '../../constants';

// @ts-expect-error
import Filmstrip from '../../../../../modules/UI/videolayout/Filmstrip';

const PROXY_URL = 'https://browser-proxy.souravdubey754.workers.dev/'; // User will need to deploy this!

const useStyles = makeStyles()(() => {
    return {
        container: {
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#ffffff',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 10,
        },
        toolbar: {
            display: 'flex',
            alignItems: 'center',
            padding: '8px',
            backgroundColor: '#f1f3f4',
            borderBottom: '1px solid #dadce0',
        },
        button: {
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            fontSize: '16px',
            '&:disabled': {
                color: '#aaa',
                cursor: 'not-allowed'
            }
        },
        externalLink: {
            marginLeft: '8px',
            padding: '6px 12px',
            backgroundColor: '#1a73e8',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        },
        input: {
            flex: 1,
            marginLeft: '8px',
            marginRight: '8px',
            padding: '8px 12px',
            borderRadius: '20px',
            border: '1px solid #dadce0',
            outline: 'none',
            fontSize: '14px',
            '&:focus': {
                border: '1px solid #1a73e8',
            }
        },
        iframeContainer: {
            flex: 1,
            position: 'relative',
        },
        iframe: {
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#ffffff'
        },
        errorOverlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f8f9fa',
            color: '#202124',
        }
    };
});

interface IProps {
    _conference: any;
    _isOwner: boolean;
    _ownerName: string;
    _sessionId: string;
    _url: string;
    _navigationVersion: number;
    _history: string[];
    _currentIndex: number;
    _localParticipantId: string;
    _scrollX: number;
    _scrollY: number;
    
    clientHeight: number;
    clientWidth: number;
    filmstripVisible: boolean;
    filmstripWidth: number;
    isBrowserShared: boolean;
    isResizing: boolean;
    onStage: boolean;
    
    dispatch: IStore['dispatch'];
}

interface IState {
    inputValue: string;
    iframeError: boolean;
    isLoading: boolean;
}

class SharedBrowserInner extends Component<IProps & { classes: any }, IState> {
    private iframeRef: React.RefObject<HTMLIFrameElement>;

    constructor(props: IProps & { classes: any }) {
        super(props);

        this.state = {
            inputValue: props._url || '',
            iframeError: false,
            isLoading: false
        };

        this.iframeRef = React.createRef();
    }

    override componentDidMount() {
        window.addEventListener('message', this._handleMessage);
    }

    override componentWillUnmount() {
        window.removeEventListener('message', this._handleMessage);
    }

    _handleMessage = (event: MessageEvent) => {
        const { _isOwner, _conference, _sessionId, _localParticipantId, _navigationVersion } = this.props;
        
        if (event.data && event.data.type === 'SYNC_SCROLL') {
            if (_isOwner) {
                // Broadcase scroll to everyone
                sendSharedBrowserCommand({
                    conference: _conference,
                    commandType: BROWSER_EVENTS.SYNC_SCROLL,
                    sessionId: _sessionId,
                    url: _url,
                    navigationVersion: _navigationVersion,
                    ownerId: _localParticipantId,
                    scrollX: event.data.scrollX,
                    scrollY: event.data.scrollY
                });
            }
        } else if (event.data && event.data.type === 'SYNC_NAVIGATE') {
            if (_isOwner) {
                this._onNavigate(event.data.url);
            }
        }
    };

    getDimensions() {
        const { clientHeight, clientWidth, filmstripVisible, filmstripWidth } = this.props;

        let width;
        let height;

        if (interfaceConfig.VERTICAL_FILMSTRIP) {
            if (filmstripVisible) {
                width = `${clientWidth - filmstripWidth}px`;
            } else {
                width = `${clientWidth}px`;
            }
            height = `${clientHeight - getToolboxHeight()}px`;
        } else {
            if (filmstripVisible) {
                height = `${clientHeight - Filmstrip.getFilmstripHeight()}px`;
            } else {
                height = `${clientHeight}px`;
            }
            width = `${clientWidth}px`;
        }

        return {
            width,
            height
        };
    }

    override componentDidUpdate(prevProps: IProps) {
        if (prevProps._url !== this.props._url) {
            this.setState({
                inputValue: this.props._url || '',
                iframeError: false,
                isLoading: !!this.props._url
            });
        }

        // If we are NOT the owner, and scroll positions changed, send message down to iframe
        if (!this.props._isOwner && this.iframeRef.current && this.iframeRef.current.contentWindow) {
            if (prevProps._scrollX !== this.props._scrollX || prevProps._scrollY !== this.props._scrollY) {
                this.iframeRef.current.contentWindow.postMessage({
                    type: 'SET_SCROLL',
                    scrollX: this.props._scrollX,
                    scrollY: this.props._scrollY
                }, '*');
            }
        }
    }

    _onNavigate = (url: string) => {
        const { _conference, _sessionId, _localParticipantId, _navigationVersion, _history, _currentIndex, dispatch } = this.props;
        
        const normalizedUrl = normalizeUrl(url);
        if (!validateBrowserUrl(normalizedUrl)) return;

        const newVersion = _navigationVersion + 1;
        const newHistory = _history.slice(0, _currentIndex + 1);
        newHistory.push(normalizedUrl);
        const newIndex = newHistory.length - 1;

        dispatch(setSharedBrowserState({
            url: normalizedUrl,
            navigationVersion: newVersion,
            history: newHistory,
            currentIndex: newIndex
        }));

        sendSharedBrowserCommand({
            conference: _conference,
            commandType: BROWSER_EVENTS.NAVIGATE,
            sessionId: _sessionId,
            url: normalizedUrl,
            navigationVersion: newVersion,
            ownerId: _localParticipantId
        });
    };

    _onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        this._onNavigate(this.state.inputValue);
    };

    _onBack = () => {
        const { _history, _currentIndex } = this.props;
        if (_currentIndex > 0) {
            this._onNavigateHistory(_currentIndex - 1);
        }
    };

    _onForward = () => {
        const { _history, _currentIndex } = this.props;
        if (_currentIndex < _history.length - 1) {
            this._onNavigateHistory(_currentIndex + 1);
        }
    };

    _onReload = () => {
        const { _conference, _sessionId, _url, _navigationVersion, _localParticipantId, dispatch } = this.props;
        if (!_url) return;

        const newVersion = _navigationVersion + 1;
        
        dispatch(setSharedBrowserState({
            navigationVersion: newVersion
        }));

        sendSharedBrowserCommand({
            conference: _conference,
            commandType: BROWSER_EVENTS.RELOAD,
            sessionId: _sessionId,
            url: _url,
            navigationVersion: newVersion,
            ownerId: _localParticipantId
        });
        
        // Force iframe reload by toggling key or similar
        this.setState({ iframeError: false, isLoading: true });
    };

    _onNavigateHistory = (index: number) => {
        const { _conference, _sessionId, _localParticipantId, _navigationVersion, _history, dispatch } = this.props;
        const url = _history[index];
        const newVersion = _navigationVersion + 1;

        dispatch(setSharedBrowserState({
            url,
            navigationVersion: newVersion,
            currentIndex: index
        }));

        sendSharedBrowserCommand({
            conference: _conference,
            commandType: BROWSER_EVENTS.NAVIGATE,
            sessionId: _sessionId,
            url,
            navigationVersion: newVersion,
            ownerId: _localParticipantId
        });
    };

    override render() {
        const { classes, _isOwner, _url, _currentIndex, _history, _ownerName, _navigationVersion, isBrowserShared, isResizing, onStage } = this.props;
        const { inputValue, iframeError, isLoading } = this.state;

        if (!isBrowserShared) {
            return null;
        }

        const canGoBack = _currentIndex > 0;
        const canGoForward = _currentIndex < _history.length - 1;
        
        const style: any = this.getDimensions();
        
        if (!onStage) {
            style.display = 'none';
        }

        // Use proxy URL to bypass CORS
        const iframeSrc = _url ? `${PROXY_URL}?url=${encodeURIComponent(_url)}` : '';

        return (
            <div className={`${classes.container} ${isResizing ? 'disable-pointer' : ''}`} style={style}>
                <div className={classes.toolbar}>
                    {_isOwner ? (
                        <>
                            <button className={classes.button} onClick={this._onBack} disabled={!canGoBack}>←</button>
                            <button className={classes.button} onClick={this._onForward} disabled={!canGoForward}>→</button>
                            <button className={classes.button} onClick={this._onReload} disabled={!_url}>↻</button>
                            <form style={{ display: 'flex', flex: 1 }} onSubmit={this._onSubmit}>
                                <input
                                    className={classes.input}
                                    value={inputValue}
                                    onChange={(e) => this.setState({ inputValue: e.target.value })}
                                    placeholder="Search or enter URL"
                                />
                            </form>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                            <span style={{ padding: '0 8px' }}>🔒 {_url || 'Waiting for URL...'}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>Controlled by {_ownerName}</span>
                        </div>
                    )}
                    {_url && (
                        <a 
                            href={_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className={classes.externalLink}
                            title="Some sites block embedding. Click here to open securely in a new tab."
                        >
                            ↗ Open externally
                        </a>
                    )}
                </div>
                <div className={classes.iframeContainer}>
                    {_url ? (
                        <iframe
                            ref={this.iframeRef}
                            key={`${_url}-${_navigationVersion}`} // Force reload on reload command
                            src={iframeSrc}
                            className={classes.iframe}
                            title="Shared Browser"
                            onLoad={() => this.setState({ isLoading: false })}
                            onError={() => this.setState({ iframeError: true, isLoading: false })}
                            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                        />
                    ) : (
                        <div className={classes.errorOverlay}>
                            <h2>🌐 Shared Browser</h2>
                            <p>Enter a URL to start browsing together.</p>
                        </div>
                    )}
                    
                    {iframeError && (
                        <div className={classes.errorOverlay}>
                            <h2>🌐</h2>
                            <p>This website can't be displayed inside the shared browser.</p>
                            <p style={{ fontSize: '12px' }}>The website doesn't allow embedded viewing.</p>
                            <a href={_url} target="_blank" rel="noopener noreferrer">Open in New Tab</a>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

function mapStateToProps(state: IReduxState) {
    const sharedBrowserState = state['features/shared-browser'];
    const localParticipantId = getLocalParticipant(state)?.id || '';
    const isOwner = sharedBrowserState.ownerId === localParticipantId;
    
    // Get owner name
    let ownerName = 'Host';
    if (sharedBrowserState.ownerId) {
        const owner = getParticipantById(state, sharedBrowserState.ownerId);
        if (owner) {
            ownerName = owner.name || 'Host';
        }
    }

    const { clientHeight, videoSpaceWidth } = state['features/base/responsive-ui'];
    const { visible, isResizing } = state['features/filmstrip'];
    const { isResizing: isChatResizing } = state['features/chat'];
    const onStage = getLargeVideoParticipant(state)?.fakeParticipant === FakeParticipant.SharedBrowser;

    return {
        _conference: getCurrentConference(state),
        _isOwner: isOwner,
        _ownerName: ownerName,
        _sessionId: sharedBrowserState.sessionId || '',
        _url: sharedBrowserState.url || '',
        _navigationVersion: sharedBrowserState.navigationVersion,
        _history: sharedBrowserState.history || [],
        _currentIndex: sharedBrowserState.currentIndex !== undefined ? sharedBrowserState.currentIndex : -1,
        _localParticipantId: localParticipantId,
        _scrollX: sharedBrowserState.scrollX || 0,
        _scrollY: sharedBrowserState.scrollY || 0,
        
        clientHeight,
        clientWidth: videoSpaceWidth,
        filmstripVisible: visible,
        filmstripWidth: getVerticalViewMaxWidth(state),
        isBrowserShared: isBrowserShared(state),
        isResizing: isResizing || isChatResizing,
        onStage
    };
}

const SharedBrowserWithStyles = (props: IProps) => {
    const { classes } = useStyles();
    return <SharedBrowserInner {...props} classes={classes} />;
};

export default connect(mapStateToProps)(SharedBrowserWithStyles);

