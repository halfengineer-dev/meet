import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IReduxState } from '../../app/types';
import { logout } from '../actions';
import { getAuthUser } from '../functions';

export default function UserMenu() {
    const dispatch = useDispatch();
    const user = useSelector((state: IReduxState) => getAuthUser(state));
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user) return null;

    const initials = user.name
        ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : user.email.substring(0, 2).toUpperCase();

    const handleLogout = () => {
        setIsOpen(false);
        dispatch(logout() as any);
    };

    return (
        <div className="faceonn-user-menu-wrapper" ref={menuRef}>
            <button
                className="faceonn-avatar-btn"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="User Account Menu">
                <div className="faceonn-avatar-circle">
                    {initials}
                </div>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>{user.name || user.email.split('@')[0]}</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>▾</span>
            </button>

            {isOpen && (
                <div className="faceonn-user-dropdown">
                    <div className="faceonn-user-dropdown-info">
                        <div className="faceonn-user-name">{user.name || 'Faceonn User'}</div>
                        <div className="faceonn-user-email">{user.email}</div>
                    </div>

                    <button
                        className="faceonn-dropdown-item"
                        onClick={() => {
                            setIsOpen(false);
                            window.location.href = '/dashboard';
                        }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                        </svg>
                        Dashboard
                    </button>

                    <button
                        className="faceonn-dropdown-item logout"
                        onClick={handleLogout}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Log Out
                    </button>
                </div>
            )}
        </div>
    );
}

