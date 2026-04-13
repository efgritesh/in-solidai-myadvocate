import React from 'react';

const LoadingState = ({ label = 'Loading...', fullScreen = false, compact = false }) => (
  <div
    className={`loading-state${fullScreen ? ' loading-state--fullscreen' : ''}${compact ? ' loading-state--compact' : ''}`}
    role="status"
    aria-live="polite"
  >
    <span className="loading-state__spinner" aria-hidden="true" />
    <p>{label}</p>
  </div>
);

export default LoadingState;
