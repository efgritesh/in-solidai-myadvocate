import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const useCurrentUserProfile = () => {
  const [state, setState] = useState({
    profile: null,
    loading: true,
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ profile: null, loading: false });
        return;
      }

      setState((current) => ({ ...current, loading: true }));

      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        setState({
          profile: snapshot.exists() ? snapshot.data() : null,
          loading: false,
        });
      } catch (error) {
        console.error('Unable to load current user profile', error);
        setState({ profile: null, loading: false });
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  return state;
};

export default useCurrentUserProfile;
