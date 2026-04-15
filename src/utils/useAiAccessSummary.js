import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { getAiAccessSummary } from './billing';

const useAiAccessSummary = () => {
  const [state, setState] = useState({
    summary: null,
    loading: true,
    error: '',
  });

  const refresh = useCallback(async () => {
    if (!auth.currentUser) {
      setState({ summary: null, loading: false, error: '' });
      return null;
    }

    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const summary = await getAiAccessSummary();
      setState({ summary, loading: false, error: '' });
      return summary;
    } catch (error) {
      setState({ summary: null, loading: false, error: error.message || 'Unable to load AI access.' });
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      refresh();
    });
    return () => unsubscribe();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
};

export default useAiAccessSummary;
