export const AUTH_STORE_NAME = 'features/auth';

// Use relative API base or environment override
export const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : '';

export const AUTH_ROUTES = {
    LOGIN: '/login',
    SIGNUP: '/signup',
    DASHBOARD: '/dashboard',
    ROOT: '/'
};

