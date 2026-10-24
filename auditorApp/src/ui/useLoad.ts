import {useCallback, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';

/* Loads data when the screen opens and quietly reloads it each time the screen comes back into focus. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const hasData = useRef(false);

  const run = useCallback(async (mode: 'auto' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else if (!hasData.current) setLoading(true);
    try {
      const value = await loaderRef.current();
      hasData.current = true;
      setData(value);
      setError('');
    } catch (e) {
      setError((e as Error).message || 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      run('auto');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, ...deps]),
  );

  const refresh = useCallback(() => run('refresh'), [run]);
  const reload = useCallback(() => run('auto'), [run]);
  return {data, setData, error, loading, refreshing, refresh, reload};
}
