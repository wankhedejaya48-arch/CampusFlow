import { useState, useRef } from 'react';
import { Upload, X, CheckCircle, AlertCircle, CloudUpload, Tag as TagIcon, Plus } from 'lucide-react';
import TopBar from '../components/TopBar';
import { departments, subjects, resourceTypes } from '../data/mockData';
import type { View } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';
import { saveFile } from '../utils/fileStorage';
import { createResource } from '../lib/resources';
import { isSupabaseConfigured } from '../lib/supabase';
import { deleteResourceFile, uploadResourceFile, validateResourceFile } from '../lib/storage';

interface UploadProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  notifCount: number;
  onSearch?: (query: string) => void;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export default function UploadResource({ onNavigate, onMobileMenuOpen, notifCount, onSearch }: UploadProps) {
  const { addResource, currentUser, classrooms, isAuthenticated } = useCampusFlow();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(['networking', 'semester-5']);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('');
  const [visibility, setVisibility] = useState('Public — visible to all students');
  const [classroom, setClassroom] = useState('');
  const availableClassrooms = classrooms.filter((room) => currentUser.role === 'teacher'
    ? room.teacherId === currentUser.id || room.createdBy === currentUser.id || (!room.teacherId && room.teacher === currentUser.name)
    : room.memberIds?.includes(currentUser.id) || room.joinedBy?.includes(currentUser.id));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chooseFile = (candidate: File) => {
    const validationError = validateResourceFile(candidate);
    setUploadError(validationError ?? '');
    if (validationError) {
      setFile(null);
      setUploadState('error');
      return;
    }
    setUploadState('idle');
    setFile(candidate);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) chooseFile(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) chooseFile(e.target.files[0]);
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput('');
    }
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file || (visibility === 'Classroom only' && !classroom)) {
      setUploadError(!file ? 'Choose a file to upload.' : 'Choose a classroom for classroom-only visibility.');
      setUploadState('error');
      return;
    }
    const validationError = validateResourceFile(file);
    if (validationError) {
      setUploadError(validationError);
      setUploadState('error');
      return;
    }
    if (isSupabaseConfigured && !isAuthenticated) {
      setUploadError('Sign in with your Supabase account before uploading a resource.');
      setUploadState('error');
      return;
    }
    setUploadState('uploading');
    setUploadError('');
    setProgress(0);
    try {
      const classroomId = classrooms.find((room) => room.code === classroom)?.id;
      const resourceVisibility = visibility === 'Public — visible to all students' ? 'public' : visibility === 'Department only' ? 'department' : 'classroom';
      let fileId: string;
      let storageProvider: 'supabase' | 'indexeddb';
      if (isSupabaseConfigured) {
        // Supabase's standard browser upload call does not report byte-level progress.
        // These milestones reflect completion of each real lifecycle phase.
        setProgress(10);
        const uploadedFile = await uploadResourceFile(file, currentUser.id);
        fileId = uploadedFile.path;
        storageProvider = 'supabase';
        setProgress(75);
        try {
          const row = await createResource({
            title: title.trim(), description: description.trim(), subject, semester: Number(semester), department,
            resource_type: resourceType as import('../types').Resource['type'], tags, uploader_id: currentUser.id,
            visibility: resourceVisibility, classroom_id: classroomId ?? null,
            storage_path: uploadedFile.path, original_file_name: uploadedFile.fileName,
            mime_type: uploadedFile.contentType, file_size: uploadedFile.size,
          });
          setProgress(95);
          addResource({
            id: row.id, fileId: row.storage_path ?? uploadedFile.path, storageProvider,
            classroomId: row.classroom_id ?? undefined, visibility: row.visibility,
            title: row.title, subject: row.subject, semester: row.semester, department: row.department,
            type: row.resource_type, description: row.description,
            uploadedBy: currentUser.name, uploadedById: row.uploader_id, uploadedByRole: currentUser.role,
            uploadedAt: new Date(row.created_at).toLocaleDateString(), views: row.views, downloads: row.downloads,
            rating: row.rating, ratingCount: row.rating_count,
            verified: row.status === 'approved' ? 'verified' : row.status,
            rejectionReason: row.rejection_reason ?? undefined, tags: row.tags,
            fileSize: `${(row.file_size ?? file.size) / 1024 / 1024 < 0.01 ? '<0.01' : ((row.file_size ?? file.size) / 1024 / 1024).toFixed(2)} MB`,
            fileType: file.name.split('.').pop()?.toUpperCase() ?? file.type,
          });
        } catch (databaseError) {
          try {
            await deleteResourceFile(uploadedFile.path);
          } catch (cleanupError) {
            console.error('Resource insert failed and uploaded file cleanup also failed', cleanupError);
            const cleanupDetail = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
            throw new Error(`${databaseError instanceof Error ? databaseError.message : String(databaseError)} The uploaded file also could not be cleaned up: ${cleanupDetail}`);
          }
          throw databaseError;
        }
      } else {
        fileId = await saveFile(file);
        storageProvider = 'indexeddb';
        addResource({
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fileId, storageProvider, classroomId, visibility: resourceVisibility, title: title.trim(), subject,
          semester: Number(semester), department, type: resourceType as import('../types').Resource['type'],
          description: description.trim(), uploadedBy: currentUser.name, uploadedById: currentUser.id,
          uploadedByRole: currentUser.role, uploadedAt: new Date().toLocaleDateString(), views: 0, downloads: 0,
          rating: 0, ratingCount: 0, verified: currentUser.role === 'teacher' ? 'verified' : 'pending', tags,
          fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          fileType: file.name.split('.').pop()?.toUpperCase() ?? file.type,
        });
      }
      setProgress(100);
      setUploadState('success');
    } catch (error) {
      console.error('Unable to save uploaded file', error);
      setUploadError(error instanceof Error ? error.message : 'The resource upload failed. Please try again.');
      setUploadState('error');
    }
  };

  if (uploadState === 'success') {
    return (
      <div className="flex-1 flex flex-col min-h-screen">
        <TopBar
          title="Upload Resource"
          onMobileMenuOpen={onMobileMenuOpen}
          onNavigate={onNavigate}
          notifCount={notifCount}
          onSearch={onSearch}
        />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={40} className="text-green-500" />
            </div>
            <h2 className="text-2xl font-extrabold text-[#0F172A] mb-2">Upload Successful!</h2>
            <p className="text-slate-500 mb-2">Your resource has been uploaded and is pending admin verification.</p>
            <div className="badge badge-yellow mx-auto mb-6">⏳ Under Review</div>
            <div className="card p-4 mb-6 text-left">
              <p className="text-sm font-semibold text-[#0F172A] mb-1">What happens next?</p>
              <ul className="text-sm text-slate-500 space-y-1 list-disc list-inside">
                <li>Admin reviews your resource for quality</li>
                <li>Verified resources get a blue badge</li>
                <li>You'll be notified once it's approved</li>
                <li>Community members can then access it</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-center">
                    <button className="btn-primary py-2.5 px-5" onClick={() => { setUploadState('idle'); setFile(null); setTitle(''); setDescription(''); }}>
                <Upload size={15} />
                Upload Another
              </button>
              <button className="btn-secondary py-2.5 px-5" onClick={() => onNavigate('my-uploads')}>
                View My Uploads
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <TopBar
        title="Upload Resource"
        onMobileMenuOpen={onMobileMenuOpen}
        onNavigate={onNavigate}
        notifCount={notifCount}
        onSearch={onSearch}
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-5">
            <p className="text-slate-500 text-sm">
              Share academic resources with your college community. All uploads are reviewed before publishing.
            </p>
          </div>

          <form onSubmit={handleUpload} className="space-y-5">
            {/* File upload area */}
            <div className="card p-5">
              <h2 className="section-title mb-4">Select File</h2>
              <div
                className={`drag-drop-zone p-8 text-center cursor-pointer ${dragging ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.ppt,.pptx,.doc,.docx,.xlsx,.zip"
                  onChange={handleFileChange}
                />
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
                      <CloudUpload size={26} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#0F172A]">{file.name}</p>
                      <p className="text-sm text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-red-500 text-sm hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    >
                      <X size={13} />
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
                      <CloudUpload size={26} className="text-blue-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#0F172A] mb-1">Drag & drop your file here</p>
                      <p className="text-sm text-slate-400">or click to browse</p>
                    </div>
                    <p className="text-xs text-slate-400">PDF, PPT, PPTX, DOC, DOCX, XLSX, ZIP · Max 20 MB</p>
                  </div>
                )}
              </div>

              {uploadState === 'uploading' && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>Uploading {file?.name}...</span>
                    <span>{Math.min(Math.round(progress), 100)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">Please don't close this page.</p>
                </div>
              )}
              {uploadState === 'error' && <p role="alert" className="mt-3 text-sm text-red-600">{uploadError || 'The resource upload failed. Please try again.'}</p>}
            </div>

            {/* Resource details */}
            <div className="card p-5">
              <h2 className="section-title mb-4">Resource Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="label">Resource Title *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g., Data Communication — Unit 4 Notes"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Description</label>
                  <textarea
                    className="input-field resize-none"
                    rows={3}
                    placeholder="Briefly describe what this resource covers, who it's for, and any special notes..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Subject *</label>
                  <select
                    className="input-field"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  >
                    <option value="">Select subject</option>
                    {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Resource Type *</label>
                  <select
                    className="input-field"
                    value={resourceType}
                    onChange={(e) => setResourceType(e.target.value)}
                    required
                  >
                    <option value="">Select type</option>
                    {resourceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Department *</label>
                  <select
                    className="input-field"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                  >
                    <option value="">Select department</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Semester *</label>
                  <select
                    className="input-field"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    required
                  >
                    <option value="">Select semester</option>
                    {[1,2,3,4,5,6,7,8].map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Visibility</label>
                  <select
                    className="input-field"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                  >
                    <option value="Public — visible to all students">Public — visible to all students</option>
                    <option value="Department only">Department only</option>
                    <option value="Classroom only">Classroom only</option>
                  </select>
                </div>
                <div>
                  <label className="label">Add to Classroom (optional)</label>
                  <select
                    className="input-field"
                    value={classroom}
                    onChange={(e) => setClassroom(e.target.value)}
                  >
                    <option value="">None</option>
                    {availableClassrooms.map((room) => <option key={room.id} value={room.code}>{room.code} — {room.subject}</option>)}
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div className="mt-4">
                <label className="label">Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 badge badge-blue">
                      <TagIcon size={9} />
                      {tag}
                      <button
                        type="button"
                        className="ml-0.5 hover:text-red-500 transition-colors"
                        onClick={() => setTags(tags.filter((t) => t !== tag))}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input-field flex-1 text-sm"
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  />
                  <button type="button" className="btn-secondary py-2 px-3 text-sm" onClick={addTag}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Guidelines */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
              <AlertCircle size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-semibold mb-1">Upload Guidelines</p>
                <ul className="text-blue-600 space-y-0.5 text-xs">
                  <li>• Only upload original content or content you have permission to share</li>
                  <li>• Do not upload personal exam papers without permission</li>
                  <li>• Resources are reviewed by admins within 24–48 hours</li>
                  <li>• Inappropriate content will be removed and reported</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button type="button" className="btn-ghost py-3 px-6" onClick={() => onNavigate('dashboard')}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary py-3 px-8 text-base rounded-xl"
                disabled={uploadState === 'uploading'}
              >
                {uploadState === 'uploading' ? (
                  <>Uploading... {Math.min(Math.round(progress), 100)}%</>
                ) : (
                  <><Upload size={16} /> Upload Resource</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
