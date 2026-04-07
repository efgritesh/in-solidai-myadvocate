import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CasesIcon,
  ClientsIcon,
  CloseIcon,
  DashboardIcon,
  DocumentsIcon,
  HearingsIcon,
  MenuIcon,
  PaymentsIcon,
  ShareIcon,
} from './AppIcons';

const defaultIcons = {
  '/dashboard': DashboardIcon,
  '/cases': CasesIcon,
  '/clients': ClientsIcon,
  '/hearings': HearingsIcon,
  '/payments': PaymentsIcon,
  '/documents': DocumentsIcon,
  '/invite': ShareIcon,
};

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
        <div className="top-nav__brand">
          <img
            className="top-nav__logo"
            src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Emblem_of_the_Supreme_Court_of_India.svg"
            alt="Supreme Court of India emblem"
          />
          <div>
            <p className="eyebrow">Legal workspace</p>
            <strong className="top-nav__title">My Advocate</strong>
          </div>
        </div>
        <button
          type="button"
          className="icon-button top-nav__toggle"
          aria-expanded={open}
          aria-label="Toggle navigation"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <CloseIcon className="app-icon" /> : <MenuIcon className="app-icon" />}
        </button>
      </div>
      <div className={`top-nav__menu${open ? ' open' : ''}`}>
        {navItems.map((item) => {
          const Icon = item.icon || defaultIcons[item.to] || DashboardIcon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `top-nav__link${isActive ? ' active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <Icon className="app-icon" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
