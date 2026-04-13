import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { ensureUserProfile, getRouteForRole } from '../utils/auth';
import LoadingState from './LoadingState';

const useAuthSession = () => {
  const [session, setSession] = useState({ user: auth.currentUser, loading: true });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSession({ user, loading: false });
    });

    return unsubscribe;
  }, []);

  return session;
};

const useResolvedProfile = (user, loading) => {
  const [state, setState] = useState({ profile: null, loading: true });

  useEffect(() => {
    let active = true;

    if (loading) {
      setState({ profile: null, loading: true });
      return () => {
        active = false;
      };
    }

    if (!user) {
      setState({ profile: null, loading: false });
      return () => {
        active = false;
      };
    }

    setState({ profile: null, loading: true });

    ensureUserProfile(user)
      .then((profile) => {
        if (active) {
          setState({ profile, loading: false });
        }
      })
      .catch(() => {
        if (active) {
          setState({ profile: null, loading: false });
        }
      });

    return () => {
      active = false;
    };
  }, [loading, user]);

  return state;
};

export const PublicOnlyRoute = ({ children }) => {
  const { user, loading } = useAuthSession();
  const { profile, loading: profileLoading } = useResolvedProfile(user, loading);

  if (loading || profileLoading) {
    return <LoadingState fullScreen label="Loading workspace..." />;
  }

  if (user && profile) {
    const target = profile.profileComplete ? getRouteForRole(profile.role) : '/profile-setup';
    return <Navigate to={target} replace />;
  }

  return children;
};

export const ProtectedRoute = ({
  children,
  allowedRoles = [],
  allowIncomplete = false,
  requirePremium = false,
  premiumFallback = '/premium',
}) => {
  const { user, loading } = useAuthSession();
  const { profile, loading: profileLoading } = useResolvedProfile(user, loading);
  const location = useLocation();

  if (loading || profileLoading) {
    return <LoadingState fullScreen label="Loading workspace..." />;
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (!allowIncomplete && !profile.profileComplete) {
    return <Navigate to="/profile-setup" replace />;
  }

  if (allowIncomplete && profile.profileComplete) {
    return <Navigate to={getRouteForRole(profile.role)} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    return <Navigate to={getRouteForRole(profile.role)} replace />;
  }

  if (requirePremium && !profile.premiumActive) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    const separator = premiumFallback.includes('?') ? '&' : '?';
    return <Navigate to={`${premiumFallback}${separator}next=${next}`} replace />;
  }

  return children;
};
