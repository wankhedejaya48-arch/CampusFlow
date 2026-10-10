import { useEffect, useRef, useState } from 'react';
import { Heart, BookOpen } from 'lucide-react';
import TopBar from '../components/TopBar';
import ResourceCard from '../components/ResourceCard';
import type { View } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';
import { canAccessResource } from '../utils/resourceAccess';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchUserFavorites, removeFavorite as removeSupabaseFavorite } from '../lib/favorites';
import type { Resource } from '../types';

interface FavoritesProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  onSelectResource: (id: string) => void;
  notifCount: number;
  onSearch?: (query: string) => void;
}

export default function Favorites({ onNavigate, onMobileMenuOpen, onSelectResource, notifCount, onSearch }: FavoritesProps) {
  const { resources, toggleFavorite: toggleLocalFavorite, currentUser, classrooms, isAuthenticated, authLoading } = useCampusFlow();
  const [databaseFavorites, setDatabaseFavorites] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');
  const pendingRemovals = useRef(new Set<string>());

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setError('');
      return;
    }
    if (authLoading) return;
    if (!isAuthenticated) {
      setDatabaseFavorites([]);
      setError('Sign in to view your favorites.');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    void fetchUserFavorites().then((favoriteResources) => {
      if (active) setDatabaseFavorites(favoriteResources);
    }).catch((loadError: unknown) => {
      if (!active) return;
      setDatabaseFavorites([]);
      setError(loadError instanceof Error ? loadError.message : 'Could not load your favorites.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentUser.id, isAuthenticated, authLoading]);

  const favorites = isSupabaseConfigured
    ? databaseFavorites
    : resources.filter((resource) => resource.isFavorited && canAccessResource(resource, currentUser, classrooms));

  const removeFavorite = async (id: string) => {
    if (!isSupabaseConfigured) {
      toggleLocalFavorite(id);
      return;
    }
    if (authLoading || !isAuthenticated || pendingRemovals.current.has(id)) return;
    pendingRemovals.current.add(id);
    const previous = databaseFavorites;
    const removed = previous.find((resource) => resource.id === id);
    setError('');
    setDatabaseFavorites((items) => items.filter((resource) => resource.id !== id));
    try {
      await removeSupabaseFavorite(id);
    } catch (removeError) {
      if (removed) setDatabaseFavorites((items) => items.some((resource) => resource.id === id) ? items : [...items, removed]);
      setError(removeError instanceof Error ? removeError.message : 'Could not remove this favorite.');
    } finally {
      pendingRemovals.current.delete(id);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <TopBar
        title="Favorites"
        onMobileMenuOpen={onMobileMenuOpen}
        onNavigate={onNavigate}
        notifCount={notifCount}
        onSearch={onSearch}
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Heart size={18} className="text-red-400 fill-red-400" />
            <p className="text-sm text-slate-500">{favorites.length} saved resources</p>
          </div>
          <button className="btn-secondary text-sm py-2 px-4" onClick={() => onNavigate('browse')}>
            <BookOpen size={14} />
            Browse More
          </button>
        </div>

        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Could not load or update favorites: {error}</p>}
        {loading && <p role="status" className="mb-4 text-sm text-slate-500">Loading favorites…</p>}

        {!loading && !error && favorites.length === 0 ? (
          <div className="empty-state">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
              <Heart size={28} className="text-red-300" />
            </div>
            <h3 className="font-bold text-[#0F172A]">No favorites yet</h3>
            <p className="text-sm text-slate-400 max-w-xs">
              Bookmark resources you love and access them quickly here.
            </p>
            <button className="btn-primary mt-2" onClick={() => onNavigate('browse')}>
              Explore Resources
            </button>
          </div>
        ) : !loading && favorites.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {favorites.map((r) => (
              <ResourceCard
                key={r.id}
                resource={{ ...r, isFavorited: true }}
                onClick={() => onSelectResource(r.id)}
                onFavorite={removeFavorite}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
