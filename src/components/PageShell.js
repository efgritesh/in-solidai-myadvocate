import React from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';

const PageShell = ({ title, subtitle, actions, children, showBack = false }) => {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <div className="page-frame">
        <header className="screen-header">
          <div className="screen-header__content">
            {showBack ? (
              <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
                Back
              </button>
            ) : null}
            <div>
              <p className="eyebrow">My Advocate</p>
              <h1>{title}</h1>
              {subtitle ? <p className="screen-subtitle">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="screen-actions">{actions}</div> : null}
        </header>
        <main className="stack">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
};

export default PageShell;
