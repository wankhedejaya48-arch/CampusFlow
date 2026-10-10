import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchFavoriteResourceIds } from '../lib/favorites';

export function useFavoriteResourceCount(localCount: number, userId: string, isAuthenticated: boolean, authLoading: boolean) {
  const [count, setCount] = useState(localCount);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCount(localCount);
      setError('');
      return;
    }
    if (authLoading) return;
    if (!isAuthenticated) {
      setCount(0);
      setError('Sign in to load your saved-resource count.');
      return;
    }
    let active = true;
    setCount(0);
    setError('');
    void fetchFavoriteResourceIds().then((ids) => {
      if (active) setCount(ids.size);
    }).catch((loadError: unknown) => {
      if (active) {
        setCount(0);
        setError(loadError instanceof Error ? loadError.message : 'Could not load your saved-resource count.');
      }
    });
    return () => { active = false; };
  }, [localCount, userId, isAuthenticated, authLoading]);

  return { count: isSupabaseConfigured ? count : localCount, error };
}
