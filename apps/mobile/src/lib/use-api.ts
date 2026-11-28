import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth/auth-context';

export interface Query<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  offlineSince: string | null;
  reload: () => void;
}

/** Lecture d'un chemin de l'API ; relancée quand la session change (statuts de leçon, inscription). */
export function useApi<T>(path: string | null): Query<T> {
  const { api, status } = useAuth();
  const [state, setState] = useState<Omit<Query<T>, 'reload'>>({ data: null, error: null, loading: true, offlineSince: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path || status === 'loading') return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get<T>(path).then(
      (r) => live && setState({ data: r.data, error: null, loading: false, offlineSince: r.offlineSince }),
      (e: Error) => live && setState({ data: null, error: e, loading: false, offlineSince: null }),
    );
    return () => { live = false; };
  }, [api, path, status, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
