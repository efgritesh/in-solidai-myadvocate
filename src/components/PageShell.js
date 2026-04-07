import React from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import { ArrowLeftIcon } from './AppIcons';

const PageShell = ({ title, subtitle, actions, children, showBack = false, navItems, showNav = true }) => {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <div className="page-frame">
        {showNav ? <BottomNav items={navItems} /> : null}
        <header className="screen-header">
          <div className="screen-header__content">
            {showBack ? (
              <button type="button" className="icon-button ghost-button ghost-button--icon" onClick={() => navigate(-1)}>
                <ArrowLeftIcon className="app-icon" />
              </button>
            ) : null}
            <div className="screen-header__copy">
              <h1>{title}</h1>
              {subtitle ? <p className="screen-subtitle">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="screen-actions">{actions}</div> : null}
        </header>
        <main className="stack">{children}</main>
      </div>
    </div>
  );
};

export default PageShell;
