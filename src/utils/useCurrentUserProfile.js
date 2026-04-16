import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useFirestoreDocument } from './firestoreCache';

const useCurrentUserProfile = () => {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    return () => unsubscribeAuth();
  }, []);

  const profileState = useFirestoreDocument({
    enabled: Boolean(currentUser?.uid),
    docFactory: useMemo(
      () => (currentUser?.uid ? () => doc(db, 'users', currentUser.uid) : null),
      [currentUser?.uid]
    ),
    queryKey: [currentUser?.uid || ''],
    mapDoc: (snapshot) => snapshot.data(),
  });

  return {
    profile: profileState.data,
    loading: currentUser ? profileState.loadingInitial : false,
    refreshing: profileState.refreshing,
    showingCached: profileState.showingCached,
    syncFailed: profileState.syncFailed,
  };
};

export default useCurrentUserProfile;
