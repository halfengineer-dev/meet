import { connect } from 'react-redux';

import { IReduxState, IStore } from '../../../app/types';
import { translate } from '../../../base/i18n/functions';
import { IconSites } from '../../../base/icons/svg';
import AbstractButton, { IProps as AbstractButtonProps } from '../../../base/toolbox/components/AbstractButton';
import { toggleSharedBrowser } from '../../actions';

interface IProps extends AbstractButtonProps {
    _isOpen: boolean;
    dispatch: IStore['dispatch'];
}

class SharedBrowserButton extends AbstractButton<IProps> {
    override accessibilityLabel = 'toolbar.accessibilityLabel.sharedBrowser';
    override icon = IconSites;
    override label = 'toolbar.sharedBrowser';
    override toggledLabel = 'toolbar.stopSharedBrowser';
    override tooltip = 'toolbar.sharedBrowser';

    override _handleClick() {
        this.props.dispatch(toggleSharedBrowser());
    }

    override _isToggled() {
        return this.props._isOpen;
    }
}

function mapStateToProps(state: IReduxState) {
    const sharedBrowserState = state['features/shared-browser'];

    return {
        _isOpen: sharedBrowserState?.isOpen
    };
}

export default translate(connect(mapStateToProps)(SharedBrowserButton as any));
