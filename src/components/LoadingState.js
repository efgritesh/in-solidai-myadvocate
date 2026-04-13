import React, { useEffect, useState } from 'react';

const LoadingState = ({ label = 'Loading...', fullScreen = false, compact = false }) => {
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
      className={`loading-state${fullScreen ? ' loading-state--fullscreen' : ''}${compact ? ' loading-state--compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="loading-state__spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
};

export default LoadingState;
