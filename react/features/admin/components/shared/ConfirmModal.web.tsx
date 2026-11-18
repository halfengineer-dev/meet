/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { AlertTriangle, X } from 'lucide-react';
import React, { useState } from 'react';

interface IConfirmModalProps {
    confirmLabel?: string;
    danger?: boolean;
    description: string;
    isLoading?: boolean;
    onCancel: () => void;
    onConfirm: (reason?: string) => void;
    requireReason?: boolean;
    title: string;
}

export default function ConfirmModal({
    title,
    description,
    confirmLabel = 'Confirm',
    danger = true,
    requireReason = false,
    isLoading = false,
    onConfirm,
    onCancel
}: IConfirmModalProps) {
    const [ reason, setReason ] = useState('');

    return (
        <div
            className = 'fa-modal-backdrop'
            onClick = { onCancel }>
            <div
                className = 'fa-modal-card'
                onClick = { e => e.stopPropagation() }>
                <div className = 'fa-modal-header'>
                    <div className = 'fa-modal-title-row'>
                        <span className = { `fa-modal-icon ${danger ? 'danger' : 'info'}` }>
                            <AlertTriangle size = { 18 } />
                        </span>
                        <h3>{title}</h3>
                    </div>
                    <button
                        className = 'fa-icon-btn'
                        onClick = { onCancel }
                        type = 'button'>
                        <X size = { 18 } />
                    </button>
                </div>

                <p className = 'fa-modal-desc'>{description}</p>

                {requireReason && (
                    <div
                        className = 'fa-field'
                        style = {{ marginTop: '14px' }}>
                        <label>Audit Reason (recorded in immutable audit log)</label>
                        <input
                            onChange = { e => setReason(e.target.value) }
                            placeholder = 'Enter reason for this action...'
                            type = 'text'
                            value = { reason } />
                    </div>
                )}

                <div className = 'fa-modal-actions'>
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        disabled = { isLoading }
                        onClick = { onCancel }
                        type = 'button'>
                        Cancel
                    </button>
                    <button
                        className = { `fa-btn ${danger ? 'fa-btn-danger' : 'fa-btn-primary'}` }
                        disabled = { isLoading || (requireReason && !reason.trim()) }
                        onClick = { () => onConfirm(reason.trim() || undefined) }
                        type = 'button'>
                        {isLoading ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
