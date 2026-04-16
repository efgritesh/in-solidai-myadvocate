import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signOut } from 'firebase/auth';
import {
  CasesIcon,
  ClientsIcon,
  CloseIcon,
  DashboardIcon,
  DraftingIcon,
  InfoIcon,
  LockIcon,
  MenuIcon,
} from './AppIcons';
import { auth } from '../firebase';
import useCurrentUserProfile from '../utils/useCurrentUserProfile';
import useAiAccessSummary from '../utils/useAiAccessSummary';
import { canUseAiNow } from '../utils/billing';

const defaultIcons = {
  '/dashboard': DashboardIcon,
  '/cases': CasesIcon,
  '/clients': ClientsIcon,
  '/drafting': DraftingIcon,
  '/profile': LockIcon,
};

const BottomNav = ({ items }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const { profile } = useCurrentUserProfile();
  const { summary: aiSummary } = useAiAccessSummary();
  const showPremiumBadge = profile?.role === 'advocate' && !canUseAiNow(aiSummary || profile || {});

  const navItems = useMemo(
    () =>
      items || [
        { to: '/dashboard', label: t('dashboard') },
        { to: '/cases', label: t('cases') },
        { to: '/clients', label: t('clients') },
        { to: '/drafting', label: t('aiDraftingAssistant'), icon: DraftingIcon },
        { to: '/profile', label: t('myProfile'), icon: LockIcon },
        { to: '/invite', label: t('inviteAdvocates'), icon: InfoIcon },
        { to: '/about', label: t('about'), icon: InfoIcon },
      ],
    [items, t]
  );

  const desktopNavItems = useMemo(
    () => navItems.filter((item) => item.to !== '/invite'),
    [navItems]
  );

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open && mobileMenuRef.current?.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <nav className="top-nav" aria-label="Primary">
      <div className="top-nav__inner">
        <div className="top-nav__bar">
          <button type="button" className="top-nav__brand" onClick={() => navigate('/dashboard')}>
            <img
              className="top-nav__logo"
              src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Emblem_of_the_Supreme_Court_of_India.svg"
              alt="Supreme Court of India emblem"
            />
            <div>
              <p className="eyebrow">Legal workspace</p>
              <strong className="top-nav__title">iAdvocate</strong>
            </div>
          </button>
          <div className="top-nav__actions">
            <div className="top-nav__menu top-nav__menu--desktop">
              {desktopNavItems.map((item) => {
                const Icon = item.icon || defaultIcons[item.to] || DashboardIcon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `top-nav__link${isActive ? ' active' : ''}`}
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="app-icon" />
                    <span className="top-nav__label">
                      <span>{item.label}</span>
                      {showPremiumBadge && item.to === '/drafting' ? (
                        <span className="premium-pill premium-pill--nav">{t('aiLockedShort')}</span>
                      ) : null}
                    </span>
                  </NavLink>
                );
              })}
            </div>
            <button
              type="button"
              className="top-nav__logout top-nav__logout--desktop"
              onClick={handleLogout}
            >
              {t('logout')}
            </button>
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
        </div>
      </div>
      <button
        type="button"
        className={`top-nav__scrim${open ? ' open' : ''}`}
        aria-label={t('closeNavigation')}
        onClick={() => setOpen(false)}
      />
      <div className={`top-nav__menu top-nav__menu--mobile${open ? ' open' : ''}`} inert={open ? undefined : ''}>
        <div className="top-nav__drawer" ref={mobileMenuRef}>
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
                <span className="top-nav__label">
                  <span>{item.label}</span>
                  {showPremiumBadge && item.to === '/drafting' ? (
                    <span className="premium-pill premium-pill--nav">{t('aiLockedShort')}</span>
                  ) : null}
                </span>
              </NavLink>
            );
          })}
          <button type="button" className="top-nav__logout top-nav__logout--mobile" onClick={handleLogout}>
            {t('logout')}
          </button>
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
