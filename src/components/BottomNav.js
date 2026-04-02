import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const BottomNav = ({ items }) => {
  const { t } = useTranslation();

  const defaultItems = [
    { to: '/dashboard', label: t('dashboard'), shortLabel: 'Home' },
    { to: '/cases', label: t('cases'), shortLabel: 'Cases' },
    { to: '/clients', label: t('clients'), shortLabel: 'Clients' },
    { to: '/hearings', label: t('hearings'), shortLabel: 'Hearings' },
    { to: '/payments', label: t('payments'), shortLabel: 'Payments' },
    { to: '/documents', label: t('documents'), shortLabel: 'Docs' },
  ];
  const navItems = items || defaultItems;

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {navItems.map((item) => (
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
