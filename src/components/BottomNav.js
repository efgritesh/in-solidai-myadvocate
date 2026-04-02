import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const BottomNav = () => {
  const { t } = useTranslation();

  const items = [
    { to: '/dashboard', label: t('dashboard'), shortLabel: 'Home' },
    { to: '/cases', label: t('cases'), shortLabel: 'Cases' },
    { to: '/clients', label: t('clients'), shortLabel: 'Clients' },
    { to: '/hearings', label: t('hearings'), shortLabel: 'Hearings' },
    { to: '/payments', label: t('payments'), shortLabel: 'Payments' },
    { to: '/documents', label: t('documents'), shortLabel: 'Docs' },
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav__link${isActive ? ' active' : ''}`}
        >
          <span>{item.shortLabel}</span>
          <small>{item.label}</small>
        </NavLink>
      ))}
    </nav>
  );
};

export default BottomNav;
