import { useState, useEffect, useRef } from 'react';
import { Search, Filter, LayoutGrid, List, X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import TopBar from '../components/TopBar';
import ResourceCard from '../components/ResourceCard';
import { departments, subjects, resourceTypes } from '../data/mockData';
import { useCampusFlow } from '../context/CampusFlowContext';
import type { Resource, View } from '../types';
import { canAccessResource } from '../utils/resourceAccess';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchResources, resourceRowToResource } from '../lib/resources';
import { addFavorite, fetchFavoriteResourceIds, removeFavorite } from '../lib/favorites';

interface BrowseProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  onSelectResource: (id: string) => void;
  notifCount: number;
  initialSearch?: string;
  onSearch?: (query: string) => void;
}

export default function BrowseResources({
  onNavigate,
  onMobileMenuOpen,
  onSelectResource,
  notifCount,
  initialSearch = '',
  onSearch,
}: BrowseProps) {
  const { resources: localResources, toggleFavorite: toggleLocalFavorite, currentUser, classrooms, isAuthenticated, authLoading } = useCampusFlow();
  const [databaseResources, setDatabaseResources] = useState<Resource[]>([]);
  const [resourceLoading, setResourceLoading] = useState(isSupabaseConfigured);
  const [resourceError, setResourceError] = useState('');
  const [favoriteError, setFavoriteError] = useState('');
  const visibleResources = isSupabaseConfigured ? databaseResources : localResources;
  const [search, setSearch] = useState(initialSearch);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(localResources.filter((r) => r.isFavorited).map((r) => r.id))
  );
  const favoriteRequests = useRef(new Set<string>());

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setResourceLoading(false);
      setDatabaseResources([]);
      setResourceError('');
      return;
    }
    if (authLoading) return;
    if (!isAuthenticated) {
      setDatabaseResources([]);
      setFavoriteIds(new Set());
      setResourceError('Sign in to load resources and your favorite status.');
      setResourceLoading(false);
      return;
    }
    let active = true;
    setResourceLoading(true);
    setResourceError('');
    setFavoriteError('');
    void Promise.allSettled([fetchResources(), fetchFavoriteResourceIds()]).then(([resourcesResult, favoritesResult]) => {
      if (!active) return;
      if (resourcesResult.status === 'rejected') {
        setDatabaseResources([]);
        setResourceError(resourcesResult.reason instanceof Error ? resourcesResult.reason.message : 'Could not load resources from Supabase.');
      } else {
        const favoriteSet = favoritesResult.status === 'fulfilled' ? favoritesResult.value : new Set<string>();
        const mapped = resourcesResult.value.map((row) => ({
          ...resourceRowToResource(row, row.uploader_id === currentUser.id ? { name: currentUser.name, role: currentUser.role } : undefined),
          isFavorited: favoriteSet.has(row.id),
        }));
        setDatabaseResources(mapped);
        if (favoritesResult.status === 'fulfilled') {
          setFavoriteIds(favoritesResult.value);
          setFavoriteError('');
        } else {
          setFavoriteIds(new Set());
          setFavoriteError(favoritesResult.reason instanceof Error ? favoritesResult.reason.message : 'Could not load favorite status.');
        }
      }
      setResourceLoading(false);
    });
    return () => { active = false; };
  }, [authLoading, currentUser.id, currentUser.name, currentUser.role, isAuthenticated]);

  useEffect(() => {
    if (!isSupabaseConfigured) setFavoriteIds(new Set(localResources.filter((resource) => resource.isFavorited).map((resource) => resource.id)));
  }, [localResources]);

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  const handleFavorite = async (id: string) => {
    if (!isSupabaseConfigured) {
      toggleLocalFavorite(id);
    } else {
      if (authLoading || !isAuthenticated) {
        setFavoriteError('Sign in to save resources to your favorites.');
        return;
      }
      if (favoriteRequests.current.has(id)) return;
      favoriteRequests.current.add(id);
      const wasFavorited = favoriteIds.has(id);
      setFavoriteError('');
      setFavoriteIds((previous) => {
        const next = new Set(previous);
        if (wasFavorited) next.delete(id); else next.add(id);
        return next;
      });
      setDatabaseResources((previous) => previous.map((resource) => resource.id === id
        ? { ...resource, isFavorited: !wasFavorited }
        : resource));
      try {
        if (wasFavorited) await removeFavorite(id); else await addFavorite(id);
      } catch (error) {
        setFavoriteIds((previous) => {
          const next = new Set(previous);
          if (wasFavorited) next.add(id); else next.delete(id);
          return next;
        });
        setDatabaseResources((previous) => previous.map((resource) => resource.id === id
          ? { ...resource, isFavorited: wasFavorited }
          : resource));
        setFavoriteError(error instanceof Error ? error.message : 'Could not update this favorite.');
      } finally {
        favoriteRequests.current.delete(id);
      }
      return;
    }
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const [filters, setFilters] = useState({
    subject: '',
    semester: '',
    department: '',
    type: '',
    sortBy: 'newest',
  });

  const filtered = visibleResources.filter((r) => isSupabaseConfigured || canAccessResource(r, currentUser, classrooms)).filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.title.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q);
    const matchSubject = !filters.subject || r.subject === filters.subject;
    const matchSemester = !filters.semester || r.semester === parseInt(filters.semester);
    const matchDept = !filters.department || r.department === filters.department;
    const matchType = !filters.type || r.type === filters.type;
    return matchSearch && matchSubject && matchSemester && matchDept && matchType;
  }).sort((a, b) => {
    if (filters.sortBy === 'downloads') return b.downloads - a.downloads;
    if (filters.sortBy === 'rating') return b.rating - a.rating;
    if (filters.sortBy === 'views') return b.views - a.views;
    return 0;
  });

  const activeFilterCount = Object.values(filters).filter((v, i) => v && i < 4).length;

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <TopBar
        title="Browse Resources"
        onMobileMenuOpen={onMobileMenuOpen}
        onNavigate={onNavigate}
        notifCount={notifCount}
        onSearch={onSearch}
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8">
        {/* Search + controls */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search notes, subjects, question papers, keywords..."
                className="input-field pl-10 py-3"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                showFilters || activeFilterCount > 0
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={14} />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 bg-white/20 rounded-full text-xs flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                className={`px-3 py-2.5 transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                className={`px-3 py-2.5 transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                onClick={() => setViewMode('list')}
              >
                <List size={16} />
              </button>
            </div>
          </div>

          {/* Sort bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-slate-500">Sort by:</span>
            {[
              { label: 'Newest', value: 'newest' },
              { label: 'Most Downloaded', value: 'downloads' },
              { label: 'Highest Rated', value: 'rating' },
              { label: 'Most Viewed', value: 'views' },
            ].map((s) => (
              <button
                key={s.value}
                className={`tab-pill text-xs ${filters.sortBy === s.value ? 'active' : ''}`}
                onClick={() => setFilters(f => ({ ...f, sortBy: s.value }))}
              >
                {s.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-400 font-medium">
              {filtered.length} resource{filtered.length !== 1 ? 's' : ''} found
            </span>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-blue-600" />
                  <span className="font-bold text-sm text-[#0F172A]">Filter Resources</span>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    className="text-xs text-red-500 hover:text-red-600 font-medium"
                    onClick={() => setFilters({ subject: '', semester: '', department: '', type: '', sortBy: 'newest' })}
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="label text-xs">Subject</label>
                  <div className="relative">
                    <select
                      className="input-field text-sm appearance-none pr-8"
                      value={filters.subject}
                      onChange={(e) => setFilters(f => ({ ...f, subject: e.target.value }))}
                    >
                      <option value="">All Subjects</option>
                      {subjects.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Semester</label>
                  <div className="relative">
                    <select
                      className="input-field text-sm appearance-none pr-8"
                      value={filters.semester}
                      onChange={(e) => setFilters(f => ({ ...f, semester: e.target.value }))}
                    >
                      <option value="">All Semesters</option>
                      {[1,2,3,4,5,6,7,8].map((s) => <option key={s} value={s}>Semester {s}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Department</label>
                  <div className="relative">
                    <select
                      className="input-field text-sm appearance-none pr-8"
                      value={filters.department}
                      onChange={(e) => setFilters(f => ({ ...f, department: e.target.value }))}
                    >
                      <option value="">All Departments</option>
                      {departments.map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Resource Type</label>
                  <div className="relative">
                    <select
                      className="input-field text-sm appearance-none pr-8"
                      value={filters.type}
                      onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
                    >
                      <option value="">All Types</option>
                      {resourceTypes.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resource type quick filters */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          <button
            className={`tab-pill whitespace-nowrap ${!filters.type ? 'active' : ''}`}
            onClick={() => setFilters(f => ({ ...f, type: '' }))}
          >
            All
          </button>
          {resourceTypes.map((t) => (
            <button
              key={t}
              className={`tab-pill whitespace-nowrap ${filters.type === t ? 'active' : ''}`}
              onClick={() => setFilters(f => ({ ...f, type: t === f.type ? '' : t }))}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Results */}
        {favoriteError && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Favorites: {favoriteError}</p>}
        {resourceLoading ? (
          <div role="status" className="card p-8 text-center text-sm text-slate-500">Loading resources…</div>
        ) : resourceError ? (
          <div role="alert" className="card p-6 text-sm text-red-700">Could not load resources: {resourceError}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Search size={28} className="text-slate-300" />
            </div>
            <h3 className="font-bold text-[#0F172A]">No resources found</h3>
            <p className="text-sm text-slate-400 max-w-xs">
              Try different keywords or adjust your filters.
            </p>
            <button
              className="btn-secondary text-sm mt-2"
              onClick={() => { setSearch(''); setFilters({ subject: '', semester: '', department: '', type: '', sortBy: 'newest' }); }}
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className={viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'
            : 'space-y-3'
          }>
            {filtered.map((r) => (
              <ResourceCard
                key={r.id}
                resource={{ ...r, isFavorited: favoriteIds.has(r.id) }}
                onClick={() => onSelectResource(r.id)}
                onFavorite={handleFavorite}
                compact={viewMode === 'list'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
