import React from 'react';

export default function AuthLoadingScreen() {
    return (
        <div className="faceonn-loading-screen">
            <div className="faceonn-spinner" />
            <img
                src="images/faceonn-neon-logo.png"
                alt="Faceonn"
                style={{ height: '32px', opacity: 0.8 }} />
        </div>
    );
}

