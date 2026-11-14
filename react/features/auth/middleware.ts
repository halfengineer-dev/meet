import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';
import { appWillNavigate } from '../base/app/actions';
import { setJWT } from '../base/jwt/actions';
import {
    AUTH_INIT_FAILURE,
    AUTH_INIT_SUCCESS,
    AUTH_LOGIN_SUCCESS,
    AUTH_LOGOUT,
    AUTH_REGISTER_SUCCESS
} from './actionTypes';
import { _getRouteToRender } from '../app/getRouteToRender';
import { IStore } from '../app/types';

MiddlewareRegistry.register((store: IStore) => next => action => {
    switch (action.type) {
    case AUTH_LOGOUT: {
        store.dispatch(setJWT(undefined));
        const result = next(action);
        _triggerNavigate(store);
        return result;
    }

    case AUTH_INIT_SUCCESS:
    case AUTH_INIT_FAILURE:
    case AUTH_LOGIN_SUCCESS:
    case AUTH_REGISTER_SUCCESS: {
        const result = next(action);
        _triggerNavigate(store);
        return result;
    }
    }

    return next(action);
});

function _triggerNavigate({ dispatch, getState }: IStore) {
    const state = getState();
    const { app } = state['features/base/app'];

    if (app && typeof app._navigate === 'function') {
        _getRouteToRender(state, dispatch).then((route: any) => {
            if (route) {
                dispatch(appWillNavigate(app, route));
                app._navigate(route);
            }
        });
    }
}
