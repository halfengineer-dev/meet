/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles, @typescript-eslint/no-unused-vars, @stylistic/max-statements-per-line */
import React from 'react';
import { connect } from 'react-redux';

import { isMobileBrowser } from '../../base/environment/utils';
import { translate, translateToHTML } from '../../base/i18n/functions';
import Icon from '../../base/icons/components/Icon';
import { IconWarning } from '../../base/icons/svg';
import Watermarks from '../../base/react/components/web/Watermarks';
import getUnsafeRoomText from '../../base/util/getUnsafeRoomText.web';
import CalendarList from '../../calendar-sync/components/CalendarList.web';
import RecentList from '../../recent-list/components/RecentList.web';
import SettingsButton from '../../settings/components/web/SettingsButton';
import { SETTINGS_TABS } from '../../settings/constants';

import { AbstractWelcomePage, IProps, _mapStateToProps } from './AbstractWelcomePage';
import HostMeetingView from './HostMeetingView.web';
import JoinMeetingView from './JoinMeetingView.web';
import Tabs from './Tabs';

/**
 * The pattern used to validate room name.
 *
 * @type {string}
 */
export const ROOM_NAME_VALIDATE_PATTERN_STR = '^[^?&:\u0022\u0027%#]+$';

/**
 * The Web container rendering the welcome page.
 *
 * @augments AbstractWelcomePage
 */
class WelcomePage extends AbstractWelcomePage<IProps> {
    _additionalContentRef: HTMLDivElement | null;
    _additionalToolbarContentRef: HTMLDivElement | null;
    _additionalCardRef: HTMLDivElement | null;
    _roomInputRef: HTMLInputElement | null;
    _additionalCardTemplate: HTMLTemplateElement | null;
    _additionalContentTemplate: HTMLTemplateElement | null;
    _additionalToolbarContentTemplate: HTMLTemplateElement | null;
    _titleHasNotAllowCharacter: boolean;

    /**
     * Default values for {@code WelcomePage} component's properties.
     *
     * @static
     */
    static defaultProps = {
        _room: ''
    };

    /**
     * Initializes a new WelcomePage instance.
     *
     * @param {Object} props - The read-only properties with which the new
     * instance is to be initialized.
     */
    constructor(props: IProps) {
        super(props);

        this.state = {
            ...this.state,
            showJoinPage: false,
            generateRoomNames:
                interfaceConfig.GENERATE_ROOMNAMES_ON_WELCOME_PAGE
        };

        /**
      * Used To display a warning massage if the title input has no allow character.
      *
      * @private
      * @type {boolean}
      */
        this._titleHasNotAllowCharacter = false;

        /**
         * The HTML Element used as the container for additional content. Used
         * for directly appending the additional content template to the dom.
         *
         * @private
         * @type {HTMLTemplateElement|null}
         */
        this._additionalContentRef = null;

        this._roomInputRef = null;

        /**
         * The HTML Element used as the container for additional toolbar content. Used
         * for directly appending the additional content template to the dom.
         *
         * @private
         * @type {HTMLTemplateElement|null}
         */
        this._additionalToolbarContentRef = null;

        this._additionalCardRef = null;

        /**
         * The template to use as the additional card displayed near the main one.
         *
         * @private
         * @type {HTMLTemplateElement|null}
         */
        this._additionalCardTemplate = document.getElementById(
            'welcome-page-additional-card-template') as HTMLTemplateElement;

        /**
         * The template to use as the main content for the welcome page. If
         * not found then only the welcome page head will display.
         *
         * @private
         * @type {HTMLTemplateElement|null}
         */
        this._additionalContentTemplate = document.getElementById(
            'welcome-page-additional-content-template') as HTMLTemplateElement;

        /**
         * The template to use as the additional content for the welcome page header toolbar.
         * If not found then only the settings icon will be displayed.
         *
         * @private
         * @type {HTMLTemplateElement|null}
         */
        this._additionalToolbarContentTemplate = document.getElementById(
            'settings-toolbar-additional-content-template'
        ) as HTMLTemplateElement;

        // Bind event handlers so they are only bound once per instance.
        this._onFormSubmit = this._onFormSubmit.bind(this);
        this._onRoomChange = this._onRoomChange.bind(this);
        this._setAdditionalCardRef = this._setAdditionalCardRef.bind(this);
        this._setAdditionalContentRef
            = this._setAdditionalContentRef.bind(this);
        this._setRoomInputRef = this._setRoomInputRef.bind(this);
        this._setAdditionalToolbarContentRef
            = this._setAdditionalToolbarContentRef.bind(this);
        this._renderFooter = this._renderFooter.bind(this);
    }

    /**
     * Implements React's {@link Component#componentDidMount()}. Invoked
     * immediately after this component is mounted.
     *
     * @inheritdoc
     * @returns {void}
     */
    override componentDidMount() {
        super.componentDidMount();

        document.body.classList.add('welcome-page');
        document.title = 'Fresh Call';

        if (this.state.generateRoomNames) {
            this._updateRoomName();
        }

        if (this._shouldShowAdditionalContent()) {
            this._additionalContentRef?.appendChild(
                this._additionalContentTemplate?.content.cloneNode(true) as Node);
        }

        if (this._shouldShowAdditionalToolbarContent()) {
            this._additionalToolbarContentRef?.appendChild(
                this._additionalToolbarContentTemplate?.content.cloneNode(true) as Node
            );
        }

        if (this._shouldShowAdditionalCard()) {
            this._additionalCardRef?.appendChild(
                this._additionalCardTemplate?.content.cloneNode(true) as Node
            );
        }
    }

    /**
     * Removes the classname used for custom styling of the welcome page.
     *
     * @inheritdoc
     * @returns {void}
     */
    override componentWillUnmount() {
        super.componentWillUnmount();

        document.body.classList.remove('welcome-page');
    }

    /**
     * Implements React's {@link Component#render()}.
     *
     * @inheritdoc
     * @returns {ReactElement|null}
     */
    override render() {
        const { _moderatedRoomServiceUrl, t } = this.props;
        const { DEFAULT_WELCOME_PAGE_LOGO_URL, DISPLAY_WELCOME_FOOTER } = interfaceConfig;
        const showAdditionalCard = this._shouldShowAdditionalCard();
        const showAdditionalContent = this._shouldShowAdditionalContent();
        const showAdditionalToolbarContent = this._shouldShowAdditionalToolbarContent();
        const contentClassName = showAdditionalContent ? 'with-content' : 'without-content';
        const footerClassName = DISPLAY_WELCOME_FOOTER ? 'with-footer' : 'without-footer';

        return (
            <div className = 'custom-welcome-page'>
                <nav className = 'navbar'>
                    <div className = 'nav-left'>
                        <div className = 'logo-icon'>
                            <svg
                                fill = 'white'
                                height = '24'
                                viewBox = '0 0 24 24'
                                width = '24'>
                                <path d = 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z' />
                            </svg>
                        </div>
                        Fresh Call
                    </div>
                    <div className = 'nav-middle'>
                        <a href = '#'>Resources</a>
                    </div>
                    <div className = 'nav-right'>
                        <a
                            className = {`btn-text ${this.state.showJoinPage ? 'active' : ''}`}
                            href = '#'
                            onClick = { e => {
                                e.preventDefault(); this.setState({ showJoinPage: true, showHostPage: false });
                            } }>Join a meeting</a>
                        <a
                            className = {`btn-text ${this.state.showHostPage ? 'active' : ''}`}
                            href = '#'
                            onClick = { e => {
                                e.preventDefault(); this.setState({ showHostPage: true, showJoinPage: false });
                            } }>Host a meeting</a>
                        <a
                            className = 'btn-text'
                            href = '#'>Sign in</a>
                        <button className = 'btn-primary-small'>Get started free</button>
                    </div>
                </nav>

                {this.state.showHostPage ? (
                    <HostMeetingView
                        generatedRoomName = {this.state.generatedRoomName}
                        onHost = { (r, options) => {
                            // Currently skipping options application to the backend/client 
                            // as we just want to join the room with video/audio toggles preset in store
                            this.setState({ room: r }, () => this._onFormSubmit({ preventDefault: () => {} } as any));
                        } } />
                ) : this.state.showJoinPage ? (
                    <JoinMeetingView
                        onJoin = { r => {
                            this.setState({ room: r }, () => this._onFormSubmit({ preventDefault: () => {} } as any));
                        } } />
                ) : (
                    <div className = 'hero-section'>
                        <div className = 'hero-content'>
                            <div className = 'badge'>
                                <div className = 'dot' />
                                Video meetings for everyone
                            </div>
                            <h1>
                                Connect, collaborate<br />
                                and get more done<br />
                                with <span>Fresh Call</span>
                            </h1>
                            <p className = 'subtitle'>
                                Secure, reliable and high quality video meetings for teams, businesses and individuals.
                            </p>

                            <div className = 'actions'>
                                <button
                                    className = 'btn-primary'
                                    onClick = { () => {
                                        this.setState({ 
                                            showHostPage: true, 
                                            room: this.state.room || this.state.generatedRoomName 
                                        });
                                    } }>
                                    Start a meeting
                                    <svg
                                        fill = 'white'
                                        height = '20'
                                        viewBox = '0 0 24 24'
                                        width = '20'>
                                        <path
                                            d = 'M5 12h14M12 5l7 7-7 7'
                                            stroke = 'white'
                                            strokeLinecap = 'round'
                                            strokeLinejoin = 'round'
                                            strokeWidth = '2' />
                                    </svg>
                                </button>

                                <div className = 'join-input-group'>
                                    <form
                                        onSubmit = { (e) => {
                                            e.preventDefault();
                                            if (!this._roomInputRef || this._roomInputRef.reportValidity()) {
                                                this.setState({ showJoinPage: true });
                                            }
                                        } }
                                        style = {{ display: 'flex', width: '100%' }}>
                                        <input
                                            aria-disabled = 'false'
                                            aria-label = { t('welcomepage.accessibilityLabel.roomname') }
                                            autoFocus = { true }
                                            id = 'enter_room_field'
                                            onChange = { this._onRoomChange }
                                            pattern = { ROOM_NAME_VALIDATE_PATTERN_STR }
                                            placeholder = 'Enter meeting code'
                                            ref = { this._setRoomInputRef }
                                            type = 'text'
                                            value = { this.state.room } />
                                        <button
                                            className = 'btn-secondary'
                                            onClick = { () => {
                                                if (!this._roomInputRef || this._roomInputRef.reportValidity()) {
                                                    this.setState({ showJoinPage: true });
                                                }
                                            } }
                                            type = 'button'>
                                            Join a meeting
                                        </button>
                                    </form>
                                </div>
                            </div>

                            <div className = 'perks'>
                                <span>No account required</span>
                                <span>Free for everyone</span>
                                <span>Works on any device</span>
                            </div>
                        </div>

                        <div className = 'hero-image'>
                            <img
                                alt = 'Fresh Call on multiple devices'
                                src = './images/homescreen.png' />
                        </div>
                    </div>
                )}

                <div className = 'features-row'>
                    <div className = 'feature-item'>
                        <div className = 'icon'>
                            <svg viewBox = '0 0 24 24'><path d = 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z' /></svg>
                        </div>
                        <h3>HD Video & Audio</h3>
                        <p>Crystal clear meetings</p>
                    </div>
                    <div className = 'feature-item'>
                        <div className = 'icon'>
                            <svg viewBox = '0 0 24 24'><path d = 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z' /></svg>
                        </div>
                        <h3>Secure by default</h3>
                        <p>End to end encryption</p>
                    </div>
                    <div className = 'feature-item'>
                        <div className = 'icon'>
                            <svg viewBox = '0 0 24 24'><path d = 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' /></svg>
                        </div>
                        <h3>Meet with anyone</h3>
                        <p>No account required</p>
                    </div>
                    <div className = 'feature-item'>
                        <div className = 'icon'>
                            <svg viewBox = '0 0 24 24'><path d = 'M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z' /></svg>
                        </div>
                        <h3>Works everywhere</h3>
                        <p>Web, iOS, Android, Desktop</p>
                    </div>
                </div>
            </div>
        );
    }

    /**
     * Renders the insecure room name warning.
     *
     * @inheritdoc
     */
    override _doRenderInsecureRoomNameWarning() {
        return (
            <div className = 'insecure-room-name-warning'>
                <Icon src = { IconWarning } />
                <span>
                    {getUnsafeRoomText(this.props.t, 'welcome')}
                </span>
            </div>
        );
    }

    /**
     * Prevents submission of the form and delegates join logic.
     *
     * @param {Event} event - The HTML Event which details the form submission.
     * @private
     * @returns {void}
     */
    _onFormSubmit(event: React.FormEvent) {
        event.preventDefault();

        if (!this._roomInputRef || this._roomInputRef.reportValidity()) {
            this._onJoin();
        }
    }

    /**
     * Overrides the super to account for the differences in the argument types
     * provided by HTML and React Native text inputs.
     *
     * @inheritdoc
     * @override
     * @param {Event} event - The (HTML) Event which details the change such as
     * the EventTarget.
     * @protected
     */
    // @ts-ignore
    // eslint-disable-next-line require-jsdoc
    _onRoomChange(event: React.ChangeEvent<HTMLInputElement>) {
        const specialCharacters = [ '?', '&', ':', '\'', '"', '%', '#', '.' ];

        this._titleHasNotAllowCharacter = specialCharacters.some(char => event.target.value.includes(char));
        super._onRoomChange(event.target.value);
    }

    /**
     * Renders the footer.
     *
     * @returns {ReactElement}
     */
    _renderFooter() {
        const {
            t,
            _deeplinkingCfg: {
                ios = { downloadLink: undefined },
                android = {
                    fDroidUrl: undefined,
                    downloadLink: undefined
                }
            }
        } = this.props;

        const { downloadLink: iosDownloadLink } = ios;

        const { fDroidUrl, downloadLink: androidDownloadLink } = android;

        return (<footer className = 'welcome-footer'>
            <div className = 'welcome-footer-centered'>
                <div className = 'welcome-footer-padded'>
                    <div className = 'welcome-footer-row-block welcome-footer--row-1'>
                        <div className = 'welcome-footer-row-1-text'>{t('welcomepage.jitsiOnMobile')}</div>
                        <a
                            className = 'welcome-badge'
                            href = { iosDownloadLink }
                            rel = 'noopener noreferrer'
                            target = '_blank'>
                            <img
                                alt = { t('welcomepage.mobileDownLoadLinkIos') }
                                src = './images/app-store-badge.png' />
                        </a>
                        <a
                            className = 'welcome-badge'
                            href = { androidDownloadLink }
                            rel = 'noopener noreferrer'
                            target = '_blank'>
                            <img
                                alt = { t('welcomepage.mobileDownLoadLinkAndroid') }
                                src = './images/google-play-badge.png' />
                        </a>
                        <a
                            className = 'welcome-badge'
                            href = { fDroidUrl }
                            rel = 'noopener noreferrer'
                            target = '_blank'>
                            <img
                                alt = { t('welcomepage.mobileDownLoadLinkFDroid') }
                                src = './images/f-droid-badge.png' />
                        </a>
                    </div>
                </div>
            </div>
        </footer>);
    }

    /**
     * Renders tabs to show previous meetings and upcoming calendar events. The
     * tabs are purposefully hidden on mobile browsers.
     *
     * @returns {ReactElement|null}
     */
    _renderTabs() {
        if (isMobileBrowser()) {
            return null;
        }

        const { _calendarEnabled, _recentListEnabled, t } = this.props;

        const tabs = [];

        if (_calendarEnabled) {
            tabs.push({
                id: 'calendar',
                label: t('welcomepage.upcomingMeetings'),
                content: <CalendarList />
            });
        }

        if (_recentListEnabled) {
            tabs.push({
                id: 'recent',
                label: t('welcomepage.recentMeetings'),
                content: <RecentList />
            });
        }

        if (tabs.length === 0) {
            return null;
        }

        return (
            <Tabs
                accessibilityLabel = { t('welcomepage.meetingsAccessibilityLabel') }
                tabs = { tabs } />
        );
    }

    /**
     * Sets the internal reference to the HTMLDivElement used to hold the
     * additional card shown near the tabs card.
     *
     * @param {HTMLDivElement} el - The HTMLElement for the div that is the root
     * of the welcome page content.
     * @private
     * @returns {void}
     */
    _setAdditionalCardRef(el: HTMLDivElement) {
        this._additionalCardRef = el;
    }

    /**
     * Sets the internal reference to the HTMLDivElement used to hold the
     * welcome page content.
     *
     * @param {HTMLDivElement} el - The HTMLElement for the div that is the root
     * of the welcome page content.
     * @private
     * @returns {void}
     */
    _setAdditionalContentRef(el: HTMLDivElement) {
        this._additionalContentRef = el;
    }

    /**
     * Sets the internal reference to the HTMLDivElement used to hold the
     * toolbar additional content.
     *
     * @param {HTMLDivElement} el - The HTMLElement for the div that is the root
     * of the additional toolbar content.
     * @private
     * @returns {void}
     */
    _setAdditionalToolbarContentRef(el: HTMLDivElement) {
        this._additionalToolbarContentRef = el;
    }

    /**
     * Sets the internal reference to the HTMLInputElement used to hold the
     * welcome page input room element.
     *
     * @param {HTMLInputElement} el - The HTMLElement for the input of the room name on the welcome page.
     * @private
     * @returns {void}
     */
    _setRoomInputRef(el: HTMLInputElement) {
        this._roomInputRef = el;
    }

    /**
     * Returns whether or not an additional card should be displayed near the tabs.
     *
     * @private
     * @returns {boolean}
     */
    _shouldShowAdditionalCard() {
        return interfaceConfig.DISPLAY_WELCOME_PAGE_ADDITIONAL_CARD
            && this._additionalCardTemplate?.content
            && this._additionalCardTemplate?.innerHTML?.trim();
    }

    /**
     * Returns whether or not additional content should be displayed below
     * the welcome page's header for entering a room name.
     *
     * @private
     * @returns {boolean}
     */
    _shouldShowAdditionalContent() {
        return interfaceConfig.DISPLAY_WELCOME_PAGE_CONTENT
            && this._additionalContentTemplate?.content
            && this._additionalContentTemplate?.innerHTML?.trim();
    }

    /**
     * Returns whether or not additional content should be displayed inside
     * the header toolbar.
     *
     * @private
     * @returns {boolean}
     */
    _shouldShowAdditionalToolbarContent() {
        return interfaceConfig.DISPLAY_WELCOME_PAGE_TOOLBAR_ADDITIONAL_CONTENT
            && this._additionalToolbarContentTemplate?.content
            && this._additionalToolbarContentTemplate?.innerHTML.trim();
    }
}

export default translate(connect(_mapStateToProps)(WelcomePage));
