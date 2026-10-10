import { useEffect, useMemo, useState } from 'react';
import { Eye, Download, Edit2, Trash2, BadgeCheck, Clock, MoreVertical, Upload } from 'lucide-react';
import TopBar from '../components/TopBar';
import { myUploads } from '../data/mockData';
import type { View, Resource } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';
import { deleteFile } from '../utils/fileStorage';
import { deleteResourceFile } from '../lib/storage';
import { deleteResource as deleteResourceRecord, fetchUserResources, resourceRowToResource } from '../lib/resources';
import { isSupabaseConfigured } from '../lib/supabase';

interface MyUploadsProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  notifCount: number;
  onSearch?: (query: string) => void;
  onSelectResource?: (id: string) => void;
}

const statusStyles = {
  verified: 'badge-green',
  pending: 'badge-yellow',
  rejected: 'badge-red',
};

const statusLabel = {
  verified: '✅ Verified',
  pending: '⏳ Pending',
  rejected: '❌ Rejected',
};

export default function MyUploads({ onNavigate, onMobileMenuOpen, notifCount, onSearch, onSelectResource }: MyUploadsProps) {
  const { resources, currentUser, removeResource, isAuthenticated } = useCampusFlow();
  const [databaseUploads, setDatabaseUploads] = useState<Resource[]>([]);
  const [databaseUploadsOwner, setDatabaseUploadsOwner] = useState('');
  const [uploadsLoading, setUploadsLoading] = useState(isSupabaseConfigured);
  const [uploadsError, setUploadsError] = useState('');
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUploadsLoading(false);
      return;
    }
    if (!isAuthenticated) {
      setDatabaseUploads([]);
      setDatabaseUploadsOwner(currentUser.id);
      setUploadsError('Sign in to load your Supabase uploads.');
      setUploadsLoading(false);
      return;
    }
    let active = true;
    setUploadsLoading(true);
    setUploadsError('');
    void fetchUserResources(currentUser.id).then((rows) => {
      if (active) {
        setDatabaseUploads(rows.map((row) => resourceRowToResource(row, { name: currentUser.name, role: currentUser.role })));
        setDatabaseUploadsOwner(currentUser.id);
      }
    }).catch((error: unknown) => {
      if (!active) return;
      setDatabaseUploads([]);
      setDatabaseUploadsOwner(currentUser.id);
      setUploadsError(error instanceof Error ? error.message : 'Could not load your uploads from Supabase.');
    }).finally(() => { if (active) setUploadsLoading(false); });
    return () => { active = false; };
  }, [currentUser.id, currentUser.name, currentUser.role, isAuthenticated]);
  const currentDatabaseUploads = databaseUploadsOwner === currentUser.id ? databaseUploads : [];
  const uploads = useMemo(() => {
    const localUploads = resources.filter((resource) =>
      (resource.uploadedById === currentUser.id || (!resource.uploadedById && resource.uploadedBy === currentUser.name))
      && (!isSupabaseConfigured || (resource.storageProvider !== 'supabase' && resource.resourceSource !== 'supabase')));
    const merged = isSupabaseConfigured
      ? [...currentDatabaseUploads, ...localUploads]
      : [...myUploads.filter((resource) => resource.uploadedBy === currentUser.name), ...localUploads];
    return merged.filter((resource, index) => merged.findIndex((item) => item.id === resource.id) === index);
  }, [resources, currentDatabaseUploads, currentUser.id, currentUser.name]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async (id: string) => {
    setDeleteError('');
    const resource = uploads.find((item) => item.id === id);
    if (resource) {
      try {
        if (resource.resourceSource === 'supabase') {
          // Remove the private object first; if metadata deletion fails, the record stays
          // available for retry and Storage removal is safe to repeat.
          if (resource.fileId) await deleteResourceFile(resource.fileId);
          await deleteResourceRecord(resource.id);
        } else if (resource.fileId) {
          await deleteFile(resource.fileId);
        }
      } catch (error) {
        console.error('Could not delete uploaded resource and file', error);
        setDeleteError(error instanceof Error ? error.message : 'The resource could not be deleted. Please try again.');
        return;
      }
      removeResource(id);
      setDatabaseUploads((previous) => previous.filter((item) => item.id !== id));
    }
    setConfirmDelete(null);
    setOpenMenu(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <TopBar
        title="My Uploads"
        onMobileMenuOpen={onMobileMenuOpen}
        onNavigate={onNavigate}
        notifCount={notifCount}
        onSearch={onSearch}
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8">
        {uploadsError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Could not load your uploads: {uploadsError}</p>}
        {uploadsLoading && <p role="status" className="mb-4 text-sm text-slate-500">Loading your uploads…</p>}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-sm text-slate-500">{uploads.length} resources uploaded by you</p>
          </div>
          <button className="btn-primary text-sm py-2.5 px-5" onClick={() => onNavigate('upload')}>
            <Upload size={14} />
            Upload New
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total Uploads', value: uploads.length, icon: '📤' },
            { label: 'Total Views', value: uploads.reduce((sum, u) => sum + u.views, 0).toLocaleString(), icon: '👁' },
            { label: 'Total Downloads', value: uploads.reduce((sum, u) => sum + u.downloads, 0).toLocaleString(), icon: '⬇' },
          ].map((s) => (
            <div key={s.label} className="card p-4 text-center">
              <p className="text-xl font-extrabold text-[#0F172A]">{s.value}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {uploads.length === 0 ? (
          <div className="empty-state">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Upload size={28} className="text-slate-300" />
            </div>
            <h3 className="font-bold text-[#0F172A]">No uploads yet</h3>
            <p className="text-sm text-slate-400">Share your notes and materials with the campus community.</p>
            <button className="btn-primary mt-2" onClick={() => onNavigate('upload')}>
              <Upload size={14} />
              Upload Your First Resource
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Table header - desktop */}
            <div
              className="hidden md:grid px-4 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider"
              style={{ gridTemplateColumns: '1fr 120px 80px 80px 80px 100px 80px' }}
            >
              <span>Resource</span>
              <span>Subject</span>
              <span className="text-center">Views</span>
              <span className="text-center">Downloads</span>
              <span className="text-center">Rating</span>
              <span className="text-center">Status</span>
              <span className="text-center">Actions</span>
            </div>

            {uploads.map((upload) => (
                <div key={upload.id} className="relative cursor-pointer" onClick={() => onSelectResource?.(upload.id)}>
                {/* Desktop row */}
                <div
                  className="hidden md:grid table-row"
                  style={{ gridTemplateColumns: '1fr 120px 80px 80px 80px 100px 80px' }}
                >
                  <div className="min-w-0 pr-4">
                    <p className="font-semibold text-sm text-[#0F172A] truncate">{upload.title}</p>
                    <p className="text-[11px] text-slate-400">{upload.type} · {upload.uploadedAt}</p>
                    {upload.rejectionReason && <p className="mt-1 text-[11px] text-red-600">Reason: {upload.rejectionReason}</p>}
                  </div>
                  <div className="text-xs text-slate-600 truncate">{upload.subject}</div>
                  <div className="text-center text-xs font-mono text-slate-600 flex items-center justify-center gap-1">
                    <Eye size={11} className="text-slate-400" />
                    {upload.views.toLocaleString()}
                  </div>
                  <div className="text-center text-xs font-mono text-slate-600 flex items-center justify-center gap-1">
                    <Download size={11} className="text-slate-400" />
                    {upload.downloads.toLocaleString()}
                  </div>
                  <div className="text-center text-xs font-bold text-amber-600">{upload.rating} ⭐</div>
                  <div className="flex items-center justify-center">
                    <span className={`badge ${statusStyles[upload.verified]}`}>
                      {statusLabel[upload.verified]}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    <button className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors text-blue-500">
                      <Edit2 size={13} />
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-red-400"
                      onClick={(event) => { event.stopPropagation(); setConfirmDelete(upload.id); }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Mobile card */}
                <div className="md:hidden p-4 border-b border-slate-50">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#0F172A] leading-tight">{upload.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{upload.subject} · {upload.type}</p>
                      {upload.rejectionReason && <p className="mt-1 text-[11px] text-red-600">Reason: {upload.rejectionReason}</p>}
                    </div>
                    <span className={`badge ${statusStyles[upload.verified]} flex-shrink-0`}>
                      {statusLabel[upload.verified]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1"><Eye size={11} />{upload.views}</span>
                    <span className="flex items-center gap-1"><Download size={11} />{upload.downloads}</span>
                    <span>⭐ {upload.rating}</span>
                    <span className="flex items-center gap-1"><Clock size={11} />{upload.uploadedAt}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      className="bg-red-50 text-red-500 border border-red-100 text-xs py-1.5 px-3 rounded-lg font-semibold flex items-center gap-1.5 hover:bg-red-100 transition-colors"
                      onClick={(event) => { event.stopPropagation(); setConfirmDelete(upload.id); }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete confirm modal */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="card p-6 max-w-sm w-full">
              <h3 className="font-bold text-[#0F172A] mb-2">Delete Resource?</h3>
              <p className="text-sm text-slate-500 mb-5">
                This action cannot be undone. The resource will be permanently removed from CampusFlow.
              </p>
              {deleteError && <p role="alert" className="text-sm text-red-600 mb-3">{deleteError}</p>}
              <div className="flex gap-3">
                <button className="btn-ghost flex-1" onClick={() => { setConfirmDelete(null); setDeleteError(''); }}>
                  Cancel
                </button>
                <button
                  className="flex-1 bg-red-500 text-white font-bold py-2.5 px-4 rounded-xl hover:bg-red-600 transition-colors"
                  onClick={() => handleDelete(confirmDelete)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
