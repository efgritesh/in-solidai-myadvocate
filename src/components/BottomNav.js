import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const BottomNav = ({ items }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const navItems = useMemo(
    () =>
      items || [
        { to: '/dashboard', label: t('dashboard') },
        { to: '/cases', label: t('cases') },
        { to: '/clients', label: t('clients') },
        { to: '/hearings', label: t('hearings') },
        { to: '/payments', label: t('payments') },
        { to: '/documents', label: t('documents') },
        { to: '/invite', label: t('inviteAdvocates') },
      ],
    [items, t]
  );

  return (
    <nav className="top-nav" aria-label="Primary">
      <div className="top-nav__bar">
        <div>
          <p className="eyebrow">Navigation</p>
          <strong className="top-nav__title">My Advocate</strong>
        </div>
        <button
          type="button"
          className="top-nav__toggle"
          aria-expanded={open}
          aria-label="Toggle navigation"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      <div className={`top-nav__menu${open ? ' open' : ''}`}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `top-nav__link${isActive ? ' active' : ''}`}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
