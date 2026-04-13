import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

const useCurrentUserProfile = () => {
  const [state, setState] = useState({
    profile: null,
    loading: true,
  });

  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!user) {
        setState({ profile: null, loading: false });
        return;
      }

      setState((current) => ({ ...current, loading: true }));

      unsubscribeProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snapshot) => {
          setState({
            profile: snapshot.exists() ? snapshot.data() : null,
            loading: false,
          });
        },
        () => {
          setState({ profile: null, loading: false });
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  return state;
};

export default useCurrentUserProfile;
