import { useEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

const EMPTY_LIST = [];

export const mapFirestoreDoc = (snapshot) => ({
  id: snapshot.id,
  ...snapshot.data(),
});

const createInitialState = (initialData) => ({
  data: initialData,
  loadingInitial: true,
  refreshing: false,
  showingCached: false,
  syncFailed: false,
  error: null,
});

export const useFirestoreCollection = ({
  enabled = true,
  queryFactory,
  queryKey = [],
  mapDoc = mapFirestoreDoc,
  initialData = EMPTY_LIST,
}) => {
  const [state, setState] = useState(() => createInitialState(initialData));
  const normalizedQueryKey = JSON.stringify(queryKey);
  const queryFactoryRef = useRef(queryFactory);
  const mapDocRef = useRef(mapDoc);

  queryFactoryRef.current = queryFactory;
  mapDocRef.current = mapDoc;

  useEffect(() => {
    const queryRef = enabled && queryFactoryRef.current ? queryFactoryRef.current() : null;
    if (!queryRef) {
      setState(createInitialState(initialData));
      return undefined;
    }

    const unsubscribe = onSnapshot(
      queryRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        setState({
          data: snapshot.docs.map((docItem) => mapDocRef.current(docItem)),
          loadingInitial: false,
          refreshing: snapshot.metadata.fromCache,
          showingCached: snapshot.metadata.fromCache,
          syncFailed: false,
          error: null,
        });
      },
      (error) => {
        setState((current) => ({
          ...current,
          loadingInitial: current.data.length === 0,
          refreshing: false,
          syncFailed: current.data.length > 0,
          error,
        }));
      }
    );

    return () => unsubscribe();
  }, [enabled, initialData, normalizedQueryKey]);

  return state;
};

export const useFirestoreDocument = ({
  enabled = true,
  docFactory,
  queryKey = [],
  mapDoc = mapFirestoreDoc,
}) => {
  const [state, setState] = useState(() => createInitialState(null));
  const normalizedQueryKey = JSON.stringify(queryKey);
  const docFactoryRef = useRef(docFactory);
  const mapDocRef = useRef(mapDoc);

  docFactoryRef.current = docFactory;
  mapDocRef.current = mapDoc;

  useEffect(() => {
    const docRef = enabled && docFactoryRef.current ? docFactoryRef.current() : null;
    if (!docRef) {
      setState(createInitialState(null));
      return undefined;
    }

    const unsubscribe = onSnapshot(
      docRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        setState({
          data: snapshot.exists() ? mapDocRef.current(snapshot) : null,
          loadingInitial: false,
          refreshing: snapshot.metadata.fromCache,
          showingCached: snapshot.metadata.fromCache,
          syncFailed: false,
          error: null,
        });
      },
      (error) => {
        setState((current) => ({
          ...current,
          loadingInitial: current.data === null,
          refreshing: false,
          syncFailed: current.data !== null,
          error,
        }));
      }
    );

    return () => unsubscribe();
  }, [enabled, normalizedQueryKey]);

  return state;
};
