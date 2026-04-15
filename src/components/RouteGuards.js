import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import {
  clearPendingGoogleState,
  consumeGoogleRedirect,
  ensureUserProfile,
  getRouteForRole,
  resolveGoogleProfileFromStoredState,
  shouldForceGoogleProfileSetup,
} from '../utils/auth';
import { canUseAiNow } from '../utils/billing';
import LoadingState from './LoadingState';

const useAuthSession = () => {
  const [session, setSession] = useState({ user: auth.currentUser, loading: true });
  const [redirectLoading, setRedirectLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('[route-guard] onAuthStateChanged', {
        uid: user?.uid || null,
        email: user?.email || null,
      });
      if (active) {
        setSession({ user, loading: false });
      }
    });

    consumeGoogleRedirect()
      .then((result) => {
        console.log('[route-guard] consumeGoogleRedirect:done', {
          hasResult: Boolean(result),
          uid: result?.user?.uid || null,
          role: result?.profile?.role || null,
          profileComplete: result?.profile?.profileComplete || false,
          flowType: result?.flowType || null,
        });
      })
      .catch((error) => {
        console.error('[route-guard] consumeGoogleRedirect:error', error);
      })
      .finally(() => {
        if (active) {
          console.log('[route-guard] consumeGoogleRedirect:finally');
          setRedirectLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { ...session, loading: session.loading || redirectLoading };
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
    console.log('[route-guard] ensureUserProfile:start', {
      uid: user?.uid || null,
      email: user?.email || null,
    });

    ensureUserProfile(user)
      .then((profile) => {
        return resolveGoogleProfileFromStoredState(user).then((storedGoogleResult) => {
          const resolvedProfile = storedGoogleResult?.profile || profile;
          if (storedGoogleResult?.flowType !== 'signup') {
            clearPendingGoogleState();
          }
          console.log('[route-guard] ensureUserProfile:resolved', {
            uid: user?.uid || null,
            usedStoredGoogleState: Boolean(storedGoogleResult),
            role: resolvedProfile?.role || null,
            profileComplete: resolvedProfile?.profileComplete || false,
          });
          return resolvedProfile;
        });
      })
      .then((profile) => {
        console.log('[route-guard] ensureUserProfile:done', {
          uid: user?.uid || null,
          role: profile?.role || null,
          profileComplete: profile?.profileComplete || false,
        });
        if (active) {
          setState({ profile, loading: false });
        }
      })
      .catch((error) => {
        console.error('[route-guard] ensureUserProfile:error', {
          uid: user?.uid || null,
          error,
        });
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
    const forceProfileSetup = shouldForceGoogleProfileSetup();
    const target = forceProfileSetup ? '/profile-setup' : profile.profileComplete ? getRouteForRole(profile.role) : '/profile-setup';
    console.log('[route-guard] PublicOnlyRoute:redirect', {
      uid: user?.uid || null,
      role: profile?.role || null,
      profileComplete: profile?.profileComplete || false,
      forceProfileSetup,
      target,
    });
    return <Navigate to={target} replace />;
  }

  console.log('[route-guard] PublicOnlyRoute:show-children');

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

  if (requirePremium && !canUseAiNow(profile)) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    const separator = premiumFallback.includes('?') ? '&' : '?';
    return <Navigate to={`${premiumFallback}${separator}next=${next}`} replace />;
  }

  return children;
};
