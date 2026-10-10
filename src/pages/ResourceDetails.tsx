import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Download, Eye, Star, Heart, BadgeCheck, Flag,
  BookOpen, FileText, Clock, User, Tag, Share2, ThumbsUp,
} from 'lucide-react';
import TopBar from '../components/TopBar';
import { resources, myUploads, reviews } from '../data/mockData';
import type { ResourceReportReason, View } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';
import { getFile } from '../utils/fileStorage';
import { canAccessResource } from '../utils/resourceAccess';
import { fetchResourceById, incrementResourceCounter, resourceRowToResource } from '../lib/resources';
import { isSupabaseConfigured } from '../lib/supabase';
import { createResourceSignedUrl, downloadResourceFile } from '../lib/storage';
import { addFavorite, isResourceFavorited, removeFavorite as removeSupabaseFavorite } from '../lib/favorites';

interface ResourceDetailsProps {
  resourceId: string;
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  notifCount: number;
  onSelectResource?: (id: string) => void;
  onSearch?: (query: string) => void;
}

function StarRating({ rating, count, interactive = false }: { rating: number; count?: number; interactive?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map((i) => (
        <Star
          key={i}
          size={interactive ? 20 : 14}
          className={`transition-colors ${
            i <= (interactive ? hover || rating : Math.round(rating))
              ? 'fill-amber-400 text-amber-400'
              : 'fill-slate-100 text-slate-200'
          } ${interactive ? 'cursor-pointer' : ''}`}
          onMouseEnter={() => interactive && setHover(i)}
          onMouseLeave={() => interactive && setHover(0)}
        />
      ))}
      {count !== undefined && (
        <span className="text-sm font-bold text-[#0F172A] ml-1">{rating}</span>
      )}
      {count !== undefined && (
        <span className="text-xs text-slate-400 ml-0.5">({count} ratings)</span>
      )}
    </div>
  );
}

export default function ResourceDetails(props: ResourceDetailsProps) {
  const { resourceId, onNavigate, onMobileMenuOpen, notifCount, onSearch } = props;
  const { resources: localResources, currentUser } = useCampusFlow();
  const localResource = localResources.find((item) => item.id === resourceId)
    || resources.find((item) => item.id === resourceId)
    || myUploads.find((item) => item.id === resourceId);
  const shouldLoadFromSupabase = isSupabaseConfigured
    && (!localResource || localResource.resourceSource === 'supabase' || localResource.storageProvider === 'supabase');
  const [databaseResource, setDatabaseResource] = useState<import('../types').Resource | null>(null);
  const [databaseResourceId, setDatabaseResourceId] = useState('');
  const [resourceLoading, setResourceLoading] = useState(shouldLoadFromSupabase);
  const [resourceLoadError, setResourceLoadError] = useState('');

  useEffect(() => {
    if (!shouldLoadFromSupabase) {
      setDatabaseResource(null);
      setDatabaseResourceId('');
      setResourceLoading(false);
      setResourceLoadError('');
      return;
    }
    let active = true;
    setResourceLoading(true);
    setResourceLoadError('');
    void fetchResourceById(resourceId).then((row) => {
      if (!active) return;
      if (!row) {
        setDatabaseResource(null);
        setDatabaseResourceId(resourceId);
        setResourceLoadError('This resource was not found or is not available to your account.');
        return;
      }
      setDatabaseResource(resourceRowToResource(row, row.uploader_id === currentUser.id
        ? { name: currentUser.name, role: currentUser.role }
        : undefined));
      setDatabaseResourceId(resourceId);
    }).catch((error: unknown) => {
      if (!active) return;
      setDatabaseResource(null);
      setDatabaseResourceId(resourceId);
      setResourceLoadError(error instanceof Error ? error.message : 'Could not load this resource from Supabase.');
    }).finally(() => { if (active) setResourceLoading(false); });
    return () => { active = false; };
  }, [resourceId, shouldLoadFromSupabase, currentUser.id, currentUser.name, currentUser.role]);

  const resource = shouldLoadFromSupabase ? databaseResource : localResource;
  if (shouldLoadFromSupabase && (resourceLoading || databaseResourceId !== resourceId)) {
    return <ResourceDetailsState title="Loading resource…" onNavigate={onNavigate} onMobileMenuOpen={onMobileMenuOpen} notifCount={notifCount} onSearch={onSearch} />;
  }
  if (shouldLoadFromSupabase && resourceLoadError) {
    return <ResourceDetailsState title={resourceLoadError} onNavigate={onNavigate} onMobileMenuOpen={onMobileMenuOpen} notifCount={notifCount} onSearch={onSearch} error />;
  }
  if (!resource) {
    return <ResourceDetailsState title="This resource could not be found." onNavigate={onNavigate} onMobileMenuOpen={onMobileMenuOpen} notifCount={notifCount} onSearch={onSearch} error />;
  }
  return <ResourceDetailsContent {...props} resource={resource} />;
}

function ResourceDetailsState({ title, onNavigate, onMobileMenuOpen, notifCount, onSearch, error = false }: {
  title: string;
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  notifCount: number;
  onSearch?: (query: string) => void;
  error?: boolean;
}) {
  return <div className="flex-1 p-8"><TopBar title="Resource Details" onMobileMenuOpen={onMobileMenuOpen} onNavigate={onNavigate} notifCount={notifCount} onSearch={onSearch}/><div className={`card mx-auto mt-8 max-w-xl p-8 text-center ${error ? 'text-red-700' : 'text-slate-600'}`} role={error ? 'alert' : 'status'}><h1 className="text-lg font-bold">{title}</h1><button className="btn-primary mt-4" onClick={() => onNavigate('browse')}>Back to Browse</button></div></div>;
}

function ResourceDetailsContent({
  resourceId,
  onNavigate,
  onMobileMenuOpen,
  notifCount,
  onSelectResource,
  onSearch,
  resource,
}: ResourceDetailsProps & { resource: import('../types').Resource }) {
  const { resources: allResources, classrooms, updateResource, toggleFavorite: toggleLocalFavorite, currentUser, updateCurrentUser, addReport, reports, isAuthenticated } = useCampusFlow();
  // Supabase row visibility is already enforced by the database RLS query; local classroom
  // state has not been migrated and must not incorrectly reject an authorized result.
  const hasAccess = resource.resourceSource === 'supabase' || canAccessResource(resource, currentUser, classrooms);
  const related = allResources.filter((r) => r.id !== resourceId && r.subject === resource.subject && canAccessResource(r, currentUser, classrooms)).slice(0, 3);
  const [favorited, setFavorited] = useState(resource.isFavorited ?? false);
  const [favoriteLoading, setFavoriteLoading] = useState(resource.resourceSource === 'supabase' || resource.storageProvider === 'supabase');
  const [favoriteError, setFavoriteError] = useState('');
  const [userRating, setUserRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [storedFile, setStoredFile] = useState<{ blob?: Blob; name: string; type: string } | null>(null);
  const [fileError, setFileError] = useState('');
  const [viewCount, setViewCount] = useState(resource.views);
  const [downloadCount, setDownloadCount] = useState(resource.downloads);
  const viewCountedFor = useRef<string | null>(null);
  const downloadInProgress = useRef(false);
  const favoriteMutationInProgress = useRef(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ResourceReportReason>('Incorrect content');
  const [reportDescription, setReportDescription] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const alreadyReported = reports.some((report) => report.resourceId === resource.id && report.reporterId === currentUser.id);
  const isSupabaseResource = resource.resourceSource === 'supabase' || resource.storageProvider === 'supabase';

  useEffect(() => {
    if (!isSupabaseResource) {
      setFavoriteLoading(false);
      setFavoriteError('');
      return;
    }
    let active = true;
    setFavoriteLoading(true);
    setFavoriteError('');
    void isResourceFavorited(resource.id).then((isFavorited) => {
      if (active) setFavorited(isFavorited);
    }).catch((error: unknown) => {
      if (active) setFavoriteError(error instanceof Error ? error.message : 'Could not load favorite status.');
    }).finally(() => { if (active) setFavoriteLoading(false); });
    return () => { active = false; };
  }, [resource.id, isSupabaseResource]);

  const handleFavoriteToggle = async () => {
    if (favoriteMutationInProgress.current || favoriteLoading) return;
    if (!isSupabaseResource) {
      setFavorited((previous) => !previous);
      toggleLocalFavorite(resource.id);
      return;
    }
    if (!isAuthenticated) {
      setFavoriteError('Sign in to manage your favorites.');
      return;
    }
    favoriteMutationInProgress.current = true;
    const previous = favorited;
    const next = !previous;
    setFavoriteError('');
    setFavoriteLoading(true);
    setFavorited(next);
    try {
      if (next) await addFavorite(resource.id);
      else await removeSupabaseFavorite(resource.id);
    } catch (error) {
      setFavorited(previous);
      setFavoriteError(error instanceof Error ? error.message : 'Could not update this favorite.');
    } finally {
      favoriteMutationInProgress.current = false;
      setFavoriteLoading(false);
    }
  };

  useEffect(() => {
    setViewCount(resource.views);
    setDownloadCount(resource.downloads);
  }, [resource.id, resource.views, resource.downloads]);

  useEffect(() => {
    if (!hasAccess || !resourceId || viewCountedFor.current === resourceId) return;
    viewCountedFor.current = resourceId;
    if (resource.resourceSource === 'supabase') {
      void incrementResourceCounter(resourceId, 'views').then((count) => {
        setViewCount(count);
        updateResource(resourceId, { views: count });
      }).catch((error: unknown) => {
        setFileError(error instanceof Error ? `Resource view could not be recorded: ${error.message}` : 'Resource view could not be recorded.');
      });
    } else if (allResources.some((item) => item.id === resourceId)) {
      const nextCount = resource.views + 1;
      setViewCount(nextCount);
      updateResource(resourceId, { views: nextCount });
    }
  // A view is recorded once per navigation, not on counter state updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setStoredFile(null);
    setFileError('');
    setFileUrl(null);
    if (resource.resourceSource === 'supabase' || resource.storageProvider === 'supabase') {
      if (!resource.fileId) {
        setFileError('This resource has no file stored in Supabase Storage.');
      } else {
        const fileName = resource.originalFileName ?? resource.fileId.split('/').pop()?.replace(/^[0-9a-f-]{36}-/i, '') ?? 'resource-file';
        const fileType = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
        setStoredFile({ name: fileName, type: fileType });
        void createResourceSignedUrl(resource.fileId, 600).then((signedUrl) => {
          if (active) setFileUrl(signedUrl);
        }).catch((error: unknown) => {
          if (active) setFileError(error instanceof Error ? error.message : 'Could not create a private preview URL.');
        });
      }
    } else if (resource.fileId) {
      getFile(resource.fileId).then((stored) => {
        if (!active) return;
        if (!stored) { setFileError('The uploaded file is missing from this browser.'); return; }
        setStoredFile(stored);
        objectUrl = URL.createObjectURL(stored.blob);
        setFileUrl(objectUrl);
      }).catch(() => { if (active) setFileError('The uploaded file could not be opened.'); });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [resource.fileId, resource.resourceSource, resource.storageProvider, resource.originalFileName]);

  useEffect(() => {
    setFavorited(resource.isFavorited ?? false);
    setUserRating(0);
    setFeedbackText('');
    setDownloadProgress(null);
  }, [resourceId, resource.isFavorited]);

  const handleDownload = async () => {
    if (downloadInProgress.current) return;
    downloadInProgress.current = true;
    setFileError('');
    setDownloadProgress(10);
    try {
      let blob: Blob;
      let fileName: string;
      if (resource.resourceSource === 'supabase' || resource.storageProvider === 'supabase') {
        if (!resource.fileId) throw new Error('This resource has no file stored in Supabase Storage.');
        const downloaded = await downloadResourceFile(resource.fileId);
        blob = downloaded.blob;
        fileName = resource.originalFileName ?? storedFile?.name ?? 'resource-file';
      } else {
        if (!storedFile?.blob) throw new Error(resource.fileId ? 'The uploaded file is unavailable.' : 'This sample resource does not have a downloadable file attached.');
        blob = storedFile.blob;
        fileName = storedFile.name;
      }
      setDownloadProgress(75);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (resource.resourceSource === 'supabase') {
        try {
          const count = await incrementResourceCounter(resourceId, 'downloads');
          setDownloadCount(count);
          updateResource(resourceId, { downloads: count });
        } catch (error) {
          throw new Error(`The file download was initiated, but its download count could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        const count = resource.downloads + 1;
        setDownloadCount(count);
        updateResource(resourceId, { downloads: count });
      }
      await updateCurrentUser({ downloads: currentUser.downloads + 1 });
      setDownloadProgress(100);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'The file could not be downloaded.');
      setDownloadProgress(null);
    } finally {
      downloadInProgress.current = false;
    }
  };

  const retryPreview = async () => {
    if (!resource.fileId || (resource.resourceSource !== 'supabase' && resource.storageProvider !== 'supabase')) return;
    setFileError('');
    setFileUrl(null);
    try {
      setFileUrl(await createResourceSignedUrl(resource.fileId, 600));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not refresh the private preview URL.');
    }
  };

  const handleOpenPreview = async () => {
    if (!fileUrl) return;
    if (resource.resourceSource !== 'supabase' && resource.storageProvider !== 'supabase') {
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!resource.fileId) return;
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      setFileError('Allow pop-ups to open this private document preview.');
      return;
    }
    previewWindow.opener = null;
    try {
      const freshUrl = await createResourceSignedUrl(resource.fileId, 600);
      previewWindow.location.replace(freshUrl);
    } catch (error) {
      previewWindow.close();
      setFileError(error instanceof Error ? error.message : 'Could not refresh the private preview URL.');
    }
  };

  const submitReport = async () => {
    const result = await addReport({ resourceId: resource.id, reason: reportReason, description: reportDescription.trim() });
    if (result.success) { setReportSubmitted(true); setReportMessage('Your report has been sent to the CampusFlow administrators.'); }
    else setReportMessage(result.message ?? (alreadyReported ? 'You have already reported this resource.' : 'This report could not be submitted.'));
  };

  if (!hasAccess) return <div className="flex-1 p-8"><TopBar title="Resource Details" onMobileMenuOpen={onMobileMenuOpen} onNavigate={onNavigate} notifCount={notifCount} onSearch={onSearch}/><div className="card mx-auto mt-8 max-w-xl p-8 text-center"><h1 className="text-lg font-bold">This resource is not available to your account.</h1><button className="btn-primary mt-4" onClick={() => onNavigate('browse')}>Back to Browse</button></div></div>;

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <TopBar
        title="Resource Details"
        onMobileMenuOpen={onMobileMenuOpen}
        onNavigate={onNavigate}
        notifCount={notifCount}
        onSearch={onSearch}
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8">
        <button
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 font-medium transition-colors"
          onClick={() => onNavigate('browse')}
        >
          <ArrowLeft size={15} />
          Back to Browse
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-5">
            {/* Resource header */}
            <div className="card p-6">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  resource.type === 'Notes' ? 'bg-blue-50' :
                  resource.type === 'Previous Year Questions' ? 'bg-purple-50' :
                  resource.type === 'Lab Manual' ? 'bg-green-50' : 'bg-orange-50'
                }`}>
                  <FileText size={26} className={
                    resource.type === 'Notes' ? 'text-blue-600' :
                    resource.type === 'Previous Year Questions' ? 'text-purple-600' :
                    resource.type === 'Lab Manual' ? 'text-green-600' : 'text-orange-600'
                  } />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h1 className="text-lg font-extrabold text-[#0F172A] leading-tight flex-1">
                      {resource.title}
                    </h1>
                    {resource.verified === 'verified' && (
                      <div className="flex items-center gap-1 badge badge-blue flex-shrink-0">
                        <BadgeCheck size={11} />
                        Verified
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="badge badge-blue">{resource.type}</span>
                    <span className="badge badge-gray">Sem {resource.semester}</span>
                    <span className="badge badge-gray">{resource.department}</span>
                    <span className="badge badge-gray">{resource.fileType} · {resource.fileSize}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <User size={13} className="text-slate-400" />
                  <span className="text-sm text-slate-600">
                    <span className="font-semibold">{resource.uploadedBy}</span>
                    <span className="text-slate-400"> · {resource.uploadedByRole}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                  <Clock size={13} />
                  <span>Uploaded {resource.uploadedAt}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-slate-400 text-sm">
                    <Eye size={13} />
                    <span>{viewCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-sm">
                    <Download size={13} />
                    <span>{downloadCount.toLocaleString()}</span>
                  </div>
                </div>
                <StarRating rating={resource.rating} count={resource.ratingCount} />
              </div>

              <p className="mt-4 text-sm text-slate-600 leading-relaxed">{resource.description}</p>

              <div className="flex flex-wrap gap-1.5 mt-4">
                {resource.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 text-[11px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-medium">
                    <Tag size={9} />
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Preview area */}
            <div className="card p-5">
              <h2 className="section-title mb-4">Document Preview</h2>
              <div className="bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
                  <BookOpen size={28} className="text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-[#0F172A] mb-1">{resource.title}</p>
                  <p className="text-sm text-slate-400">{storedFile?.name ?? `${resource.fileType} · ${resource.fileSize}`}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary py-2 px-5 text-sm rounded-xl" onClick={handleOpenPreview} disabled={!fileUrl}>
                    <Eye size={14} />
                    View Document
                  </button>
                  <button
                    className="btn-secondary py-2 px-5 text-sm rounded-xl"
                    onClick={handleDownload}
                  >
                    <Download size={14} />
                    Download
                  </button>
                </div>
                {fileUrl && storedFile && (storedFile.type === 'application/pdf' || storedFile.name.toLowerCase().endsWith('.pdf')) && <iframe title={`Preview: ${storedFile.name}`} src={fileUrl} onError={() => setFileError('The preview URL may have expired. Refresh it to try again.')} className="w-full h-[600px] rounded-lg border border-slate-200" />}
                {fileError && <p role="status" className="text-sm text-amber-700">{fileError}</p>}
                {fileError && (resource.resourceSource === 'supabase' || resource.storageProvider === 'supabase') && <button type="button" className="btn-secondary py-1.5 px-3 text-xs" onClick={retryPreview}>Refresh preview</button>}
                {downloadProgress !== null && (
                  <div className="w-64">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Downloading...</span>
                      <span>{downloadProgress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${downloadProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Reviews */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">Reviews & Feedback</h2>
                <div className="flex items-center gap-2">
                  <Star size={16} className="fill-amber-400 text-amber-400" />
                  <span className="font-bold">{resource.rating}</span>
                  <span className="text-sm text-slate-400">({resource.ratingCount})</span>
                </div>
              </div>

              {/* Write review */}
              <div className="bg-[#F8FAFF] rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-slate-600 mb-2">Rate this resource</p>
                <StarRating rating={userRating} interactive />
                <textarea
                  className="input-field mt-3 text-sm resize-none"
                  rows={2}
                  placeholder="Share your feedback..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                />
                <button className="btn-primary text-sm py-2 px-4 mt-2 rounded-lg" disabled={!userRating}>
                  Submit Review
                </button>
              </div>

              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="border-b border-slate-50 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <div className="avatar w-8 h-8 text-xs flex-shrink-0">
                        {review.user.split(' ').map(w => w[0]).join('').slice(0,2)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-[#0F172A]">{review.user}</span>
                          <span className="text-[11px] text-slate-400">{review.date}</span>
                        </div>
                        <StarRating rating={review.rating} />
                        <p className="text-sm text-slate-600 mt-1.5">{review.comment}</p>
                        <button className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-500 mt-1.5 transition-colors">
                          <ThumbsUp size={10} />
                          Helpful
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Actions */}
            <div className="card p-5 space-y-3">
              <h2 className="section-title">Actions</h2>
              <button className="btn-primary w-full justify-center py-3 text-sm rounded-xl" onClick={handleDownload}>
                <Download size={15} />
                Download ({resource.fileSize})
              </button>
              <button className="btn-secondary w-full justify-center py-2.5 text-sm rounded-xl" onClick={handleOpenPreview} disabled={!fileUrl}>
                <Eye size={15} />
                View in Browser
              </button>
              <button
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  favorited
                    ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => void handleFavoriteToggle()}
                disabled={favoriteLoading}
              >
                <Heart size={15} className={favorited ? 'fill-red-400' : ''} />
                {favorited ? 'Remove from Favorites' : 'Add to Favorites'}
              </button>
              {favoriteError && <p role="alert" className="text-xs text-red-600">Could not update favorite: {favoriteError}</p>}
              <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold text-slate-600 border-slate-200 hover:bg-slate-50 transition-all">
                <Share2 size={15} />
                Share Resource
              </button>
              {currentUser.role !== 'admin' && <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-50 transition-all" onClick={() => { setReportOpen(true); setReportMessage(''); setReportSubmitted(false); }}>
                <Flag size={15} />
                {alreadyReported ? 'Report Submitted' : 'Report Resource'}
              </button>}
            </div>

            {/* Resource info */}
            <div className="card p-5">
              <h2 className="section-title mb-3">Resource Info</h2>
              <div className="space-y-2.5">
                {[
                  { label: 'Subject', value: resource.subject },
                  { label: 'Department', value: resource.department },
                  { label: 'Semester', value: `Semester ${resource.semester}` },
                  { label: 'Format', value: `${resource.fileType} · ${resource.fileSize}` },
                  { label: 'Uploaded By', value: resource.uploadedBy },
                  { label: 'Status', value: resource.verified === 'verified' ? '✅ Verified' : resource.verified === 'rejected' ? '❌ Rejected' : '⏳ Pending' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-start gap-2">
                    <span className="text-xs text-slate-400 font-medium flex-shrink-0">{label}</span>
                    <span className="text-xs font-semibold text-[#0F172A] text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Related */}
            {related.length > 0 && (
              <div className="card p-5">
                <h2 className="section-title mb-3">Related Resources</h2>
                <div className="space-y-2">
                  {related.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start gap-2 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => {
                        if (onSelectResource) {
                          onSelectResource(r.id);
                        } else {
                          onNavigate('resource-details');
                        }
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <BookOpen size={14} className="text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-[#0F172A] line-clamp-2">{r.title}</p>
                        <p className="text-[10px] text-slate-400">{r.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {reportOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="report-resource-title"><div className="card w-full max-w-lg p-6"><div className="mb-4 flex items-start justify-between"><div><h2 id="report-resource-title" className="text-lg font-bold">Report Resource</h2><p className="text-sm text-slate-500">Help administrators review “{resource.title}”.</p></div><button className="text-slate-400 hover:text-slate-700" onClick={() => setReportOpen(false)} aria-label="Close report form">×</button></div>{reportSubmitted ? <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">{reportMessage}</div> : <><label className="label">Reason<select className="input-field mt-1" value={reportReason} onChange={(event) => setReportReason(event.target.value as ResourceReportReason)}>{['Incorrect content','Spam','Inappropriate content','Duplicate resource','Copyright concern','Other'].map((reason) => <option key={reason}>{reason}</option>)}</select></label><label className="label mt-4 block">Details (optional)<textarea className="input-field mt-1" rows={3} maxLength={500} value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} placeholder="Add context to help with the review"/></label>{reportMessage && <p role="alert" className="mt-3 text-sm text-red-600">{reportMessage}</p>}<div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setReportOpen(false)}>Cancel</button><button className="btn-primary" disabled={alreadyReported} onClick={submitReport}>Submit Report</button></div></>}</div></div>}
    </div>
  );
}
