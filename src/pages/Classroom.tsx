import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Plus, Users, BookOpen, Bell, Copy, Check, ChevronRight, Hash, LogIn, Search, Share2 } from 'lucide-react';
import TopBar from '../components/TopBar';
import type { Classroom as ClassroomModel, ClassroomAnnouncement, View } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';
import { canAccessResource } from '../utils/resourceAccess';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  createClassroom as createSupabaseClassroom,
  fetchClassroomAnnouncementCounts,
  fetchClassroomResources,
  fetchClassroomAnnouncements,
  createAnnouncement,
  fetchClassroomsForUser,
  joinClassroomByCode,
  shareResourceWithClassroom,
  type ClassroomSummary,
} from '../lib/classrooms';
import { fetchUserResources, resourceRowToResource } from '../lib/resources';

interface ClassroomProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  notifCount: number;
  onSearch?: (query: string) => void;
  onSelectResource?: (id: string) => void;
}

const shortId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const makeCode = (existing: ClassroomModel[]) => {
  let code = '';
  do { code = `CF${Math.random().toString(36).slice(2, 7).toUpperCase()}`; }
  while (existing.some((room) => room.code.toUpperCase() === code));
  return code;
};

function toClassroomModel(summary: ClassroomSummary, currentUser: ReturnType<typeof useCampusFlow>['currentUser']): ClassroomModel {
  const classroom = summary.classroom;
  const teacher = summary.memberships.find((member) => member.role === 'teacher');
  const memberIds = summary.memberships.map((member) => member.user_id);
  const studentIds = summary.memberships.filter((member) => member.role === 'student').map((member) => member.user_id);
  return {
    id: classroom.id,
    name: classroom.name,
    subject: classroom.subject,
    code: classroom.share_code,
    teacher: teacher?.name ?? (classroom.teacher_id === currentUser.id ? currentUser.name : 'Classroom teacher'),
    teacherId: classroom.teacher_id,
    createdBy: classroom.teacher_id,
    members: summary.memberships.length,
    memberIds,
    joinedBy: studentIds,
    resources: summary.resourceIds.length,
    sharedResourceIds: summary.resourceIds,
    announcements: summary.announcementCount ?? 0,
    department: classroom.department,
    semester: classroom.semester,
    createdAt: new Date(classroom.created_at).toLocaleDateString(),
  };
}

export default function Classroom({ onNavigate, onMobileMenuOpen, notifCount, onSearch, onSelectResource }: ClassroomProps) {
  const { classrooms: localClassrooms, setClassrooms, resources: localResources, currentUser, users, classroomAnnouncements, setClassroomAnnouncements, addNotification, isAuthenticated, authLoading } = useCampusFlow();
  const [databaseSummaries, setDatabaseSummaries] = useState<ClassroomSummary[]>([]);
  const [databaseResources, setDatabaseResources] = useState<import('../types').Resource[]>([]);
  const [databaseRoomResources, setDatabaseRoomResources] = useState<import('../types').Resource[]>([]);
  const [databaseAnnouncements, setDatabaseAnnouncements] = useState<ClassroomAnnouncement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementPostError, setAnnouncementPostError] = useState('');
  const [roomResourcesLoading, setRoomResourcesLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isSupabaseConfigured);
  const [pageError, setPageError] = useState('');
  const [roomResourcesError, setRoomResourcesError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [department, setDepartment] = useState(currentUser.department || 'Information Technology');
  const [semester, setSemester] = useState(String(currentUser.semester ?? 5));
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [shareId, setShareId] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setPageLoading(false);
      return;
    }
    if (authLoading) return;
    if (!isAuthenticated) {
      setDatabaseSummaries([]);
      setDatabaseResources([]);
      setPageError('Sign in to load your Supabase classrooms.');
      setPageLoading(false);
      return;
    }
    let active = true;
    setPageLoading(true);
    setPageError('');
    const errors: string[] = [];
    const loadRooms = fetchClassroomsForUser(currentUser.id).then(async (summaries) => {
      let announcementCounts: Record<string, number> = {};
      try {
        announcementCounts = await fetchClassroomAnnouncementCounts(summaries.map((summary) => summary.classroom.id));
      } catch (loadError) {
        errors.push(loadError instanceof Error ? loadError.message : 'Could not load announcement counts.');
      }
      if (active) setDatabaseSummaries(summaries.map((summary) => ({
        ...summary,
        announcementCount: announcementCounts[summary.classroom.id] ?? 0,
      })));
    }).catch((loadError: unknown) => {
      if (active) setDatabaseSummaries([]);
      errors.push(loadError instanceof Error ? loadError.message : 'Could not load classrooms.');
    });
    const loadResources = fetchUserResources(currentUser.id).then((rows) => {
      if (active) setDatabaseResources(rows.map((row) => resourceRowToResource(row, { name: currentUser.name, role: currentUser.role })));
    }).catch((loadError: unknown) => {
      if (active) setDatabaseResources([]);
      errors.push(loadError instanceof Error ? loadError.message : 'Could not load your resources.');
    });
    void Promise.all([loadRooms, loadResources]).finally(() => {
      if (!active) return;
      setPageError(errors.join(' '));
      setPageLoading(false);
    });
    return () => { active = false; };
  }, [currentUser.id, currentUser.name, currentUser.role, isAuthenticated, authLoading]);

  useEffect(() => {
    if (!isSupabaseConfigured || !activeId) {
      setDatabaseRoomResources([]);
      setRoomResourcesLoading(false);
      setRoomResourcesError('');
      return;
    }
    let active = true;
    setDatabaseRoomResources([]);
    setRoomResourcesError('');
    setRoomResourcesLoading(true);
    void fetchClassroomResources(activeId).then((rows) => {
      if (active) setDatabaseRoomResources(rows.map((row) => resourceRowToResource(row,
        row.uploader_id === currentUser.id ? { name: currentUser.name, role: currentUser.role } : undefined)));
    }).catch((loadError: unknown) => {
      if (!active) return;
      setRoomResourcesError(loadError instanceof Error ? loadError.message : 'Could not load classroom resources.');
    }).finally(() => { if (active) setRoomResourcesLoading(false); });
    return () => { active = false; };
  }, [activeId, currentUser.id, currentUser.name, currentUser.role]);

  const activeSummary = databaseSummaries.find((summary) => summary.classroom.id === activeId);
  const activeTeacherName = activeSummary?.memberships.find((member) => member.role === 'teacher')?.name ?? 'Classroom teacher';

  useEffect(() => {
    if (!isSupabaseConfigured || !activeId) {
      setDatabaseAnnouncements([]);
      setAnnouncementsLoading(false);
      setAnnouncementsError('');
      return;
    }
    let active = true;
    setDatabaseAnnouncements([]);
    setAnnouncementsError('');
    setAnnouncementsLoading(true);
    void fetchClassroomAnnouncements(activeId).then((rows) => {
      if (!active) return;
      setDatabaseAnnouncements(rows.map((row) => ({
        id: row.id,
        classroomId: row.classroom_id,
        author: row.teacher_id === currentUser.id ? currentUser.name : activeTeacherName,
        authorId: row.teacher_id,
        title: row.title,
        message: row.message,
        createdAt: new Date(row.created_at).toLocaleString(),
      })));
      setDatabaseSummaries((previous) => previous.map((summary) => summary.classroom.id === activeId
        ? { ...summary, announcementCount: rows.length }
        : summary));
    }).catch((loadError: unknown) => {
      if (!active) return;
      setDatabaseAnnouncements([]);
      setAnnouncementsError(loadError instanceof Error ? loadError.message : 'Could not load announcements.');
    }).finally(() => { if (active) setAnnouncementsLoading(false); });
    return () => { active = false; };
  }, [activeId, currentUser.id, currentUser.name, activeTeacherName]);

  const classrooms = isSupabaseConfigured ? databaseSummaries.map((summary) => toClassroomModel(summary, currentUser)) : localClassrooms;
  const resources = isSupabaseConfigured
    ? [...databaseResources, ...localResources.filter((resource) => resource.storageProvider === 'indexeddb')]
    : localResources;

  const isOwner = (room: ClassroomModel) => room.teacherId === currentUser.id || room.createdBy === currentUser.id
    || (!room.teacherId && !room.createdBy && room.teacher === currentUser.name);
  const isMember = (room: ClassroomModel) => !!room.memberIds?.includes(currentUser.id) || !!room.joinedBy?.includes(currentUser.id);
  const legacyMock = (room: ClassroomModel) => !room.teacherId && !room.createdBy && !room.memberIds?.length && !room.joinedBy?.length;
  const visibleRooms = useMemo(() => classrooms.filter((room) => isSupabaseConfigured || (currentUser.role === 'admin'
    ? true
    : currentUser.role === 'teacher' ? isOwner(room) || legacyMock(room) : isMember(room) || legacyMock(room)))
    .filter((room) => `${room.name} ${room.subject} ${room.department} ${room.semester}`.toLowerCase().includes(search.toLowerCase())), [classrooms, currentUser, search]);
  const room = classrooms.find((item) => item.id === activeId);
  const owner = room ? isOwner(room) : false;
  const roomAnnouncements = room ? isSupabaseConfigured
    ? databaseAnnouncements.filter((item) => item.classroomId === room.id)
    : classroomAnnouncements.filter((item) => item.classroomId === room.id) : [];
  const resourceCount = (target: ClassroomModel) => {
    if (isSupabaseConfigured) return target.resources;
    const linked = resources.filter((item) => item.classroomId === target.id || target.sharedResourceIds?.includes(item.id)).length;
    return linked || target.resources;
  };
  const roomResources = room ? isSupabaseConfigured
    ? databaseRoomResources
    : resources.filter((resource) => ((room.sharedResourceIds ?? []).includes(resource.id) || resource.classroomId === room.id) && canAccessResource(resource, currentUser, classrooms)) : [];
  const displayedResources = room && roomResources.length === 0 && legacyMock(room) && !isSupabaseConfigured
    ? resources.slice(0, Math.min(3, room.resources)).filter((resource) => canAccessResource(resource, currentUser, classrooms))
    : roomResources;
  const shareableResources = (isSupabaseConfigured ? databaseResources : resources).filter((resource) => (resource.uploadedById === currentUser.id || (!resource.uploadedById && resource.uploadedBy === currentUser.name))
    && !room?.sharedResourceIds?.includes(resource.id) && resource.classroomId !== room?.id);

  const notify = (userId: string, id: string, title: string, message: string, type: 'classroom' | 'announcement' = 'classroom') => {
    addNotification({ id: `${id}-${userId}`, type, title, message, time: 'Just now', read: false, userId });
  };
  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => undefined);
    setCopied(code);
    window.setTimeout(() => setCopied(''), 1800);
  };

  const joinClass = async () => {
    const code = joinCode.trim().toUpperCase();
    if (currentUser.role !== 'student') return;
    if (isSupabaseConfigured) {
      setError('');
      try {
        const joined = await joinClassroomByCode(code);
        setDatabaseSummaries((previous) => [joined, ...previous.filter((summary) => summary.classroom.id !== joined.classroom.id)]);
        setJoinCode('');
        setActiveId(joined.classroom.id);
      } catch (joinError) {
        setError(joinError instanceof Error ? joinError.message : 'Could not join this classroom.');
      }
      return;
    }
    const target = classrooms.find((item) => item.code.toUpperCase() === code);
    if (!target) { setError('No classroom matches that code. Check it and try again.'); return; }
    if (isMember(target)) { setError('You have already joined this classroom.'); setActiveId(target.id); return; }
    const members = [...new Set([...(target.memberIds ?? target.joinedBy ?? []), currentUser.id])];
    setClassrooms((previous) => previous.map((item) => item.id === target.id ? { ...item, memberIds: members, joinedBy: members, members: Math.max(item.members, (target.memberIds ?? target.joinedBy ?? []).length) + 1 } : item));
    notify(currentUser.id, `joined-${target.id}-${currentUser.id}`, 'Joined Classroom Successfully', `You joined ${target.name}.`);
    setJoinCode(''); setError(''); setActiveId(target.id);
  };

  const createClass = async () => {
    if (!name.trim() || !subject.trim()) { setError('Enter a classroom name and subject.'); return; }
    if (isSupabaseConfigured) {
      setError('');
      try {
        const created = await createSupabaseClassroom({ name, subject, department, semester: Number(semester) });
        setDatabaseSummaries((previous) => [created, ...previous.filter((summary) => summary.classroom.id !== created.classroom.id)]);
        setName(''); setSubject(''); setShowCreate(false); setActiveId(created.classroom.id);
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : 'Could not create this classroom.');
      }
      return;
    }
    const created: ClassroomModel = {
      id: `class-${shortId()}`, name: name.trim(), subject: subject.trim(), code: makeCode(classrooms),
      teacher: currentUser.name, teacherId: currentUser.id, createdBy: currentUser.id,
      members: 0, memberIds: [], joinedBy: [], resources: 0, sharedResourceIds: [], announcements: 0,
      department, semester: Number(semester), createdAt: new Date().toLocaleDateString(),
    };
    setClassrooms((previous) => [...previous, created]);
    notify(currentUser.id, `created-${created.id}`, 'Classroom Created', `${created.name} is ready. Share code ${created.code} with students.`);
    setName(''); setSubject(''); setShowCreate(false); setError(''); setActiveId(created.id);
  };

  const postAnnouncement = async () => {
    if (!room || !owner || !announcementTitle.trim() || !announcementMessage.trim()) return;
    if (isSupabaseConfigured) {
      setAnnouncementPostError('');
      setAnnouncementSaving(true);
      try {
        const row = await createAnnouncement(room.id, { title: announcementTitle, message: announcementMessage });
        const entry: ClassroomAnnouncement = {
          id: row.id,
          classroomId: row.classroom_id,
          author: currentUser.name,
          authorId: row.teacher_id,
          title: row.title,
          message: row.message,
          createdAt: new Date(row.created_at).toLocaleString(),
        };
        setDatabaseAnnouncements((previous) => [entry, ...previous.filter((item) => item.id !== entry.id)]);
        setDatabaseSummaries((previous) => previous.map((summary) => summary.classroom.id === room.id
          ? { ...summary, announcementCount: (summary.announcementCount ?? 0) + 1 }
          : summary));
        setAnnouncementTitle('');
        setAnnouncementMessage('');
      } catch (postError) {
        setAnnouncementPostError(postError instanceof Error ? postError.message : 'Could not post the announcement.');
      } finally {
        setAnnouncementSaving(false);
      }
      return;
    }
    const id = `announcement-${shortId()}`;
    const entry: ClassroomAnnouncement = { id, classroomId: room.id, author: currentUser.name, authorId: currentUser.id, title: announcementTitle.trim(), message: announcementMessage.trim(), createdAt: new Date().toLocaleString() };
    setClassroomAnnouncements((previous) => [entry, ...previous]);
    setClassrooms((previous) => previous.map((item) => item.id === room.id ? { ...item, announcements: (item.announcements ?? 0) + 1 } : item));
    (room.memberIds ?? room.joinedBy ?? []).forEach((memberId) => notify(memberId, id, `${entry.title} · ${room.name}`, entry.message, 'announcement'));
    setAnnouncementTitle(''); setAnnouncementMessage('');
  };

  const shareResource = async () => {
    if (!room || !owner || !shareId) return;
    const resource = resources.find((item) => item.id === shareId);
    if (!resource) return;
    if (isSupabaseConfigured) {
      setError('');
      try {
        await shareResourceWithClassroom(room.id, resource.id, currentUser.id);
        const rows = await fetchClassroomResources(room.id);
        const mapped = rows.map((row) => resourceRowToResource(row,
          row.uploader_id === currentUser.id ? { name: currentUser.name, role: currentUser.role } : undefined));
        setDatabaseRoomResources(mapped);
        setDatabaseSummaries((previous) => previous.map((summary) => summary.classroom.id === room.id
          ? { ...summary, resourceIds: [...new Set([...summary.resourceIds, resource.id])] }
          : summary));
        // Supabase-backed shares create recipient notifications in the database trigger.
        setShareId('');
      } catch (shareError) {
        setError(shareError instanceof Error ? shareError.message : 'Could not share this resource.');
      }
      return;
    }
    setClassrooms((previous) => previous.map((item) => item.id === room.id ? { ...item, sharedResourceIds: [...new Set([...(item.sharedResourceIds ?? []), resource.id])], resources: item.resources + 1 } : item));
    (room.memberIds ?? room.joinedBy ?? []).forEach((memberId) => notify(memberId, `shared-${room.id}-${resource.id}`, `New resource in ${room.name}`, resource.title));
    setShareId('');
  };

  return <div className="flex-1 flex flex-col min-h-screen">
    <TopBar title={room?.name ?? 'Classroom'} onMobileMenuOpen={onMobileMenuOpen} onNavigate={onNavigate} notifCount={notifCount} onSearch={onSearch} />
    <main className="flex-1 p-4 md:p-6 lg:p-8">
      {pageError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{pageError}</p>}
      {pageLoading && <p role="status" className="mb-4 text-sm text-slate-500">Loading classrooms…</p>}
      {room ? <>
        <button className="mb-4 text-sm text-slate-500" onClick={() => setActiveId(null)}>← Back to Classrooms</button>
        <section className="mb-5 rounded-2xl bg-gradient-to-r from-[#0B1E40] to-[#1E40AF] p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-sm text-blue-200">{room.subject} · {room.department} · Semester {room.semester}</p><h1 className="text-xl font-extrabold">{room.name}</h1><p className="mt-1 text-sm text-blue-200">Teacher: {room.teacher}</p></div>
            <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-lg tracking-widest"><Hash size={14}/>{room.code}<button onClick={() => copyCode(room.code)} aria-label="Copy classroom code">{copied === room.code ? <Check size={15}/> : <Copy size={15}/>}</button></div>
          </div>
          <div className="mt-4 flex gap-5 text-sm text-blue-100"><span><Users className="mr-1 inline" size={14}/>{room.members} members</span><span><BookOpen className="mr-1 inline" size={14}/>{resourceCount(room)} resources</span><span><Bell className="mr-1 inline" size={14}/>{roomAnnouncements.length || room.announcements} announcements</span></div>
        </section>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <section className="space-y-3 lg:col-span-2"><div className="flex items-center justify-between"><h2 className="section-title">Shared Resources</h2>{owner && <div className="flex gap-2"><select className="input-field text-sm" value={shareId} onChange={(event) => setShareId(event.target.value)}><option value="">Choose your upload…</option>{shareableResources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button className="btn-primary text-xs" disabled={!shareId} onClick={shareResource}><Share2 size={13}/>Share</button></div>}</div>
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            {roomResourcesError && <p role="alert" className="text-xs text-red-600">Could not load classroom resources: {roomResourcesError}</p>}
            {roomResourcesLoading && <p role="status" className="text-xs text-slate-400">Loading classroom resources…</p>}
            {!roomResourcesLoading && (displayedResources.length ? displayedResources.map((item) => <button key={item.id} onClick={() => onSelectResource?.(item.id)} className="card flex w-full items-center gap-3 p-4 text-left hover:border-blue-200"><BookOpen size={18} className="text-blue-600"/><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.title}</strong><small className="text-slate-400">{item.type} · {item.uploadedBy} · {item.fileType}</small></span><ChevronRight size={15} className="text-slate-300"/></button>) : <p className="card p-5 text-sm text-slate-500">No resources have been shared with this classroom yet.</p>)}
          </section>
          <aside className="space-y-5">
            <section><h2 className="section-title mb-3">Announcements</h2>{announcementsLoading && <p role="status" className="mb-2 text-xs text-slate-500">Loading announcements…</p>}{announcementsError && <p role="alert" className="mb-2 text-xs text-red-600">Could not load announcements: {announcementsError}</p>}<div className="space-y-2">{roomAnnouncements.map((item) => <article key={item.id} className="card p-3.5"><p className="text-xs font-semibold text-slate-500">{item.author} · {item.createdAt}</p><h3 className="mt-1 text-sm font-bold">{item.title ?? 'Announcement'}</h3><p className="mt-1 text-xs">{item.message}</p></article>)}{!announcementsLoading && !announcementsError && !roomAnnouncements.length && (!isSupabaseConfigured && legacyMock(room) || isSupabaseConfigured) && <p className="card p-3 text-xs text-slate-500">No new announcements.</p>}</div>
              {owner && <div className="mt-3 space-y-2"><input className="input-field text-sm" placeholder="Announcement title" value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)}/><textarea className="input-field text-sm" placeholder="Write an update for your class…" value={announcementMessage} onChange={(event) => setAnnouncementMessage(event.target.value)}/>{announcementPostError && <p role="alert" className="text-xs text-red-600">{announcementPostError}</p>}<button className="btn-primary w-full" disabled={announcementSaving || !announcementTitle.trim() || !announcementMessage.trim()} onClick={() => void postAnnouncement()}>{announcementSaving ? 'Posting…' : 'Post Announcement'}</button></div>}
            </section>
            <section><h2 className="section-title mb-3">Members ({room.members})</h2><div className="card space-y-2 p-3">{(room.memberIds ?? room.joinedBy ?? []).map((id) => { const member = users.find((item) => item.id === id); const directoryMember = activeSummary?.memberships.find((item) => item.user_id === id); return <p key={id} className="text-sm">{isSupabaseConfigured ? directoryMember?.name ?? 'CampusFlow member' : member?.name ?? 'CampusFlow student'}{isSupabaseConfigured && directoryMember ? <span className="ml-1 text-xs text-slate-400">· {directoryMember.role}</span> : null}</p>; })}{!room.memberIds?.length && !room.joinedBy?.length && <p className="text-xs text-slate-400">Existing members are represented in the member count.</p>}</div></section>
          </aside>
        </div>
      </> : <>
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          {currentUser.role === 'student' && <section className="card p-5"><h2 className="section-title mb-2"><LogIn className="mr-2 inline" size={17}/>Join a Classroom</h2><p className="mb-3 text-sm text-slate-500">Enter the share code provided by your teacher.</p><div className="flex gap-2"><input className="input-field flex-1 text-center font-mono uppercase tracking-widest" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} onKeyDown={(event) => event.key === 'Enter' && joinClass()} placeholder="CFABC12"/><button className="btn-primary" disabled={joinCode.trim().length < 4} onClick={joinClass}>Join</button></div>{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}</section>}
          {currentUser.role === 'teacher' && <section className="card p-5"><h2 className="section-title mb-2"><Plus className="mr-2 inline" size={17}/>Create a Classroom</h2><p className="mb-3 text-sm text-slate-500">Create a course space and share its unique code.</p><button className="btn-secondary w-full justify-center" onClick={() => { setShowCreate((value) => !value); setError(''); }}>Create Classroom</button></section>}
        </div>
        {showCreate && <section className="card mb-5 p-5"><h2 className="section-title mb-4">New Classroom</h2><div className="grid gap-3 md:grid-cols-2"><label className="label">Classroom name<input className="input-field mt-1" value={name} onChange={(event) => setName(event.target.value)}/></label><label className="label">Subject<input className="input-field mt-1" value={subject} onChange={(event) => setSubject(event.target.value)}/></label><label className="label">Department<input className="input-field mt-1" value={department} onChange={(event) => setDepartment(event.target.value)}/></label><label className="label">Semester<select className="input-field mt-1" value={semester} onChange={(event) => setSemester(event.target.value)}>{[1,2,3,4,5,6,7,8].map((value) => <option key={value} value={value}>Semester {value}</option>)}</select></label></div>{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}<div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn-primary" onClick={createClass}><Plus size={14}/>Create Classroom</button></div></section>}
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="section-title">{currentUser.role === 'teacher' ? 'My Classrooms' : currentUser.role === 'admin' ? 'Classrooms' : 'Joined Classrooms'}</h2><div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400"/><input className="input-field pl-9" placeholder="Search classrooms" value={search} onChange={(event) => setSearch(event.target.value)}/></div></div>
        {pageLoading ? null : visibleRooms.length ? <div className="grid gap-4 md:grid-cols-2">{visibleRooms.map((item) => <article key={item.id} role="button" tabIndex={0} className="card card-hover p-5 text-left" onClick={() => setActiveId(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setActiveId(item.id); }}><div className="mb-3 flex items-center justify-between"><GraduationCap className="text-blue-600"/><span className="font-mono text-xs tracking-wider text-slate-500">{item.code}</span></div><h3 className="font-bold">{item.name}</h3><p className="text-sm text-slate-400">{item.subject} · {item.department} · Sem {item.semester}</p><p className="mt-1 text-xs text-slate-500">{item.teacher}</p><div className="mt-3 flex gap-4 border-t pt-3 text-xs text-slate-400"><span><Users size={12} className="mr-1 inline"/>{item.members}</span><span><BookOpen size={12} className="mr-1 inline"/>{resourceCount(item)}</span><span><Bell size={12} className="mr-1 inline"/>{isSupabaseConfigured ? (activeId === item.id ? databaseAnnouncements.length : item.announcements) : classroomAnnouncements.filter((a) => a.classroomId === item.id).length || item.announcements}</span><button className="ml-auto" aria-label="Copy share code" onClick={(event) => { event.stopPropagation(); copyCode(item.code); }}>{copied === item.code ? <Check size={13}/> : <Copy size={13}/>}</button></div></article>)}</div> : <div className="card p-6 text-center text-sm text-slate-500">No classrooms match your search.</div>}
      </>}
    </main>
  </div>;
}
