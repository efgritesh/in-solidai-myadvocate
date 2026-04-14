import React, { useEffect, useState } from 'react';

const LoadingState = ({ label = 'Loading...', fullScreen = false, compact = false, overlay = false, children = null }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 180);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`loading-state${fullScreen ? ' loading-state--fullscreen' : ''}${compact ? ' loading-state--compact' : ''}${overlay ? ' loading-state--overlay' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className={`loading-state__surface${overlay ? ' loading-state__surface--overlay' : ''}`}>
        <span className="loading-state__spinner" aria-hidden="true" />
        <p>{label}</p>
        {children}
      </div>
    </div>
  );
};

export default LoadingState;
