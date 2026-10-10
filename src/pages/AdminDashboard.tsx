import { useEffect, useMemo, useState } from 'react';
import { Users, BookOpen, Shield, AlertTriangle, CheckCircle, XCircle, BarChart3, TrendingUp, Eye, Trash2, Clock, Flag, UserCheck, UserX } from 'lucide-react';
import TopBar from '../components/TopBar';
import type { Resource, ResourceReport, View } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';
import { deleteFile } from '../utils/fileStorage';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  fetchAdminDashboardData,
  moderateAdminResource,
  recordAdminModerationAction,
  removeReportedResource as removeReportedResourceFromDatabase,
  resolveAdminReport,
  setAdminUserStatus,
  type AdminDashboardData,
} from '../lib/admin';
import { deleteResourceFileForAdmin } from '../lib/storage';

interface AdminProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  notifCount: number;
  onSearch?: (query: string) => void;
  onSelectResource?: (id: string) => void;
}

type AdminTab = 'overview' | 'approvals' | 'users' | 'reports';
const timeNow = () => new Date().toLocaleString();

export default function AdminDashboard({ onNavigate, onMobileMenuOpen, notifCount, onSearch, onSelectResource }: AdminProps) {
  const {
    hasRole, resources: localResources, users: localUsers, updateResource, addNotification, currentUser,
    reports: localReports, updateReportStatus, moderationLogs: localModerationLogs, addModerationLog, disableUser, enableUser,
    removeResource,
  } = useCampusFlow();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [rejecting, setRejecting] = useState<Resource | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [removingReport, setRemovingReport] = useState<ResourceReport | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [adminData, setAdminData] = useState<AdminDashboardData | null>(null);
  const [adminLoading, setAdminLoading] = useState(isSupabaseConfigured);
  const [adminError, setAdminError] = useState('');
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (currentUser.role !== 'admin') {
      setAdminData(null);
      setAdminLoading(false);
      return;
    }
    let active = true;
    setAdminData(null);
    setAdminLoading(true);
    setAdminError('');
    void fetchAdminDashboardData().then((data) => {
      if (active) setAdminData(data);
    }).catch((error: unknown) => {
      if (active) {
        setAdminData(null);
        setAdminError(error instanceof Error ? error.message : 'Could not load administrator data.');
      }
    }).finally(() => { if (active) setAdminLoading(false); });
    return () => { active = false; };
  }, [currentUser.id, currentUser.role]);

  const resources = isSupabaseConfigured ? adminData?.resources ?? [] : localResources;
  const users = isSupabaseConfigured ? adminData?.users ?? [] : localUsers;
  const reports = isSupabaseConfigured ? adminData?.reports ?? [] : localReports;
  const moderationLogs = isSupabaseConfigured ? adminData?.moderationLogs ?? [] : localModerationLogs;
  const pending = resources.filter((resource) => resource.verified === 'pending');
  const rejected = resources.filter((resource) => resource.verified === 'rejected');
  const openReports = reports.filter((report) => report.status === 'open');
  const selectedUser = users.find((user) => user.id === selectedUserId);

  const record = async (action: string, target: string, targetType: 'resource' | 'report' | 'user', targetId: string) => {
    if (isSupabaseConfigured) await recordAdminModerationAction(action, target, targetType, targetId);
    else addModerationLog({ action, target });
  };
  const refreshAdminData = async () => {
    if (!isSupabaseConfigured) return;
    setAdminLoading(true);
    try {
      setAdminData(await fetchAdminDashboardData());
      setAdminError('');
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not reload administrator data.');
    } finally {
      setAdminLoading(false);
    }
  };
  const notifyUploader = (resource: Resource, action: 'approved' | 'rejected', reason?: string) => {
    const userId = resource.uploadedById ?? users.find((user) => user.name === resource.uploadedBy)?.id;
    addNotification({
      id: `resource-${resource.id}-${action}`,
      type: 'verification',
      title: action === 'approved' ? 'Resource approved' : 'Resource rejected',
      message: action === 'approved'
        ? `Your resource “${resource.title}” has been approved.`
        : `Your resource “${resource.title}” was rejected by an administrator.${reason ? ` Reason: ${reason}` : ''}`,
      time: 'Just now', read: false, userId,
    });
  };

  const approve = async (resource: Resource) => {
    if (!hasRole('admin')) return;
    setActionError('');
    try {
      if (isSupabaseConfigured) await moderateAdminResource(resource.id, 'approved', null);
      else updateResource(resource.id, { verified: 'verified', rejectionReason: undefined });
      notifyUploader(resource, 'approved');
      await record('resource-approved', resource.title, 'resource', resource.id);
      await refreshAdminData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The resource could not be approved.');
      await refreshAdminData();
    }
  };

  const reject = async () => {
    if (!hasRole('admin') || !rejecting) return;
    setActionError('');
    try {
      if (isSupabaseConfigured) await moderateAdminResource(rejecting.id, 'rejected', rejectionReason.trim() || null);
      else updateResource(rejecting.id, { verified: 'rejected', rejectionReason: rejectionReason.trim() || undefined });
      notifyUploader(rejecting, 'rejected', rejectionReason.trim());
      await record('resource-rejected', rejecting.title, 'resource', rejecting.id);
      setRejecting(null); setRejectionReason('');
      await refreshAdminData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The resource could not be rejected.');
      await refreshAdminData();
    }
  };

  const dismissReport = async (report: ResourceReport) => {
    if (!hasRole('admin')) return;
    setActionError('');
    try {
      if (isSupabaseConfigured) await resolveAdminReport(report.id, 'dismissed');
      else updateReportStatus(report.id, 'dismissed');
      addNotification({ id: `report-${report.id}-dismissed`, type: 'verification', title: 'Report reviewed', message: `Your report about “${report.resourceTitle}” was reviewed and dismissed.`, time: 'Just now', read: false, userId: report.reporterId });
      await record('report-dismissed', report.resourceTitle, 'report', report.id);
      await refreshAdminData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The report could not be dismissed.');
      await refreshAdminData();
    }
  };

  const removeReportedResource = async () => {
    if (!hasRole('admin') || !removingReport) return;
    const report = removingReport;
    const resource = resources.find((item) => item.id === report.resourceId);
    const relatedReports = reports.filter((item) => item.resourceId === report.resourceId);
    if (!resource && !isSupabaseConfigured) {
      relatedReports.forEach((item) => {
        updateReportStatus(item.id, 'removed');
        addNotification({ id: `report-${item.id}-removed`, type: 'verification', title: 'Reported resource removed', message: `The resource “${item.resourceTitle}” you reported was removed.`, time: 'Just now', read: false, userId: item.reporterId });
      });
      await record('resource-removed', report.resourceTitle, 'report', report.id);
      setRemovingReport(null);
      return;
    }
    setActionError('');
    try {
      if (isSupabaseConfigured) {
        if (!resource) {
          throw new Error('The reported resource is no longer available. Reload the Admin Dashboard and try again.');
        }
        if (resource.fileId) await deleteResourceFileForAdmin(resource.fileId);
        await removeReportedResourceFromDatabase(resource.id);
      } else {
        if (resource?.fileId) {
          try { await deleteFile(resource.fileId); }
          catch (error) { console.error('Could not remove IndexedDB file', error); setActionError('The file could not be cleared from local storage, but the resource metadata will still be removed.'); }
        }
        if (resource) removeResource(resource.id);
        relatedReports.forEach((item) => updateReportStatus(item.id, 'removed'));
      }
      relatedReports.forEach((item) => {
        addNotification({ id: `report-${item.id}-removed`, type: 'verification', title: 'Reported resource removed', message: `The resource “${item.resourceTitle}” you reported was removed.`, time: 'Just now', read: false, userId: item.reporterId });
      });
      await record('resource-removed', report.resourceTitle, resource ? 'resource' : 'report', resource?.id ?? report.id);
      setRemovingReport(null);
      await refreshAdminData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The reported resource could not be removed.');
      await refreshAdminData();
    }
  };

  const toggleUser = async (userId: string, status: 'active' | 'disabled') => {
    if (!hasRole('admin')) return;
    const target = users.find((user) => user.id === userId);
    if (!target || target.role === 'admin' || target.id === currentUser.id) return;
    const action = status === 'disabled' ? 'user-disabled' : 'user-enabled';
    setActionError('');
    try {
      if (isSupabaseConfigured) await setAdminUserStatus(userId, status);
      else {
        const changed = status === 'disabled' ? disableUser(userId) : enableUser(userId);
        if (!changed) return;
      }
      await record(action, `${target.name} (${target.email})`, 'user', userId);
      addNotification({ id: `account-${userId}-${status}`, type: 'verification', title: status === 'disabled' ? 'Account disabled' : 'Account re-enabled', message: status === 'disabled' ? 'An administrator disabled your CampusFlow account.' : 'An administrator re-enabled your CampusFlow account.', time: 'Just now', read: false, userId });
      await refreshAdminData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The account status could not be changed.');
      await refreshAdminData();
    }
  };

  const stats = [
    { label: 'Total Users', value: users.length, icon: Users, color: 'blue' },
    { label: 'Students', value: users.filter((user) => user.role === 'student').length, icon: Users, color: 'purple' },
    { label: 'Teachers', value: users.filter((user) => user.role === 'teacher').length, icon: Shield, color: 'green' },
    { label: 'Total Resources', value: resources.length, icon: BookOpen, color: 'orange' },
    { label: 'Pending Approvals', value: pending.length, icon: Clock, color: 'yellow' },
    { label: 'Open Reports', value: openReports.length, icon: Flag, color: 'red' },
    { label: 'Approved', value: resources.filter((resource) => resource.verified === 'verified').length, icon: CheckCircle, color: 'green' },
    { label: 'Rejected', value: rejected.length, icon: XCircle, color: 'red' },
    { label: 'Disabled Users', value: users.filter((user) => user.accountStatus === 'disabled').length, icon: UserX, color: 'yellow' },
  ];

  const userRows = useMemo(() => users.map((user) => ({
    ...user,
    uploads: resources.filter((resource) => resource.uploadedById === user.id || (!resource.uploadedById && resource.uploadedBy === user.name)).length,
  })), [users, resources]);

  if (!hasRole('admin')) return <div className="flex-1 flex items-center justify-center p-8"><div className="card p-8 text-center"><Shield className="mx-auto mb-3 text-slate-400"/><h1 className="text-xl font-bold text-[#0F172A]">Administrator access required</h1><p className="mt-2 text-sm text-slate-500">Your account cannot open the Admin Dashboard.</p><button className="btn-primary mt-5" onClick={() => onNavigate('dashboard')}>Return to Dashboard</button></div></div>;
  if (isSupabaseConfigured && (adminLoading || adminError || !adminData)) return <div className="flex-1 flex items-center justify-center p-8"><div className="card max-w-xl p-8 text-center"><Shield className="mx-auto mb-3 text-slate-400"/><h1 className="text-xl font-bold text-[#0F172A]">{adminLoading ? 'Loading Admin Dashboard' : 'Administrator data unavailable'}</h1><p role={adminLoading ? 'status' : 'alert'} className="mt-2 text-sm text-slate-500">{adminLoading ? 'Loading trusted Supabase data…' : adminError || 'Administrator access could not be verified.'}</p>{!adminLoading && <button className="btn-primary mt-5" onClick={() => void refreshAdminData()}>Retry</button>}</div></div>;

  const tabs: { key: AdminTab; label: string; icon: typeof BarChart3 }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'approvals', label: `Approvals (${pending.length})`, icon: CheckCircle },
    { key: 'users', label: `Users (${users.length})`, icon: Users },
    { key: 'reports', label: `Reports (${openReports.length})`, icon: AlertTriangle },
  ];

  return <div className="flex-1 flex flex-col min-h-screen">
    <TopBar title="Admin Dashboard" onMobileMenuOpen={onMobileMenuOpen} onNavigate={onNavigate} notifCount={notifCount} onSearch={onSearch}/>
    <main className="flex-1 p-4 md:p-6 lg:p-8">
      <div className="mb-5 flex items-center gap-2"><span className="badge badge-purple flex items-center gap-1.5 px-3 py-1.5"><Shield size={12}/>Administrator Access</span><span className="text-xs text-slate-400">CampusFlow Admin Panel</span></div>
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{tabs.map(({key,label,icon:Icon})=><button key={key} className={`tab-pill flex items-center gap-1.5 whitespace-nowrap ${activeTab===key?'active':''}`} onClick={()=>{setActiveTab(key);setActionError('');}}><Icon size={13}/>{label}</button>)}</div>
      {actionError && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{actionError}</p>}

      {activeTab === 'overview' && <div className="space-y-5"><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{stats.map(({label,value,icon:Icon,color})=><div key={label} className={`stat-card ${color==='yellow'?'orange':color==='red'?'blue':color}`}><div className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-blue-600"><Icon size={16}/></div><p className="text-xl font-extrabold text-[#0F172A]">{value}</p><p className="text-[10px] font-semibold text-slate-500">{label}</p></div>)}</div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2"><section className="card p-5"><div className="mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-blue-500"/><h2 className="section-title">Recent Admin Activity</h2></div>{moderationLogs.length ? <div className="space-y-3">{moderationLogs.slice(0,8).map((entry)=><div key={entry.id} className="flex items-start gap-3"><div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500"/><p className="min-w-0 flex-1 text-xs"><strong>{entry.action.replace(/-/g, ' ')}</strong> · {entry.target}<span className="block text-[10px] text-slate-400">{entry.adminName} · {entry.createdAt}</span></p></div>)}</div> : <p className="text-sm text-slate-400">Moderation actions will appear here.</p>}</section>
        <section className="card p-5"><div className="mb-4 flex items-center gap-2"><BarChart3 size={16} className="text-blue-500"/><h2 className="section-title">Platform Statistics</h2></div><div className="space-y-4">{[{label:'Approved Resources',value:stats[6].value,total:resources.length},{label:'Teacher Uploads',value:resources.filter((item)=>item.uploadedByRole==='teacher').length,total:resources.length},{label:'Active Users',value:users.filter((user)=>user.accountStatus!=='disabled').length,total:users.length}].map((item)=><div key={item.label}><div className="mb-1 flex justify-between text-xs text-slate-500"><span>{item.label}</span><span>{item.value} / {item.total}</span></div><div className="progress-bar"><div className="progress-fill" style={{width:`${item.total?Math.min(100,item.value/item.total*100):0}%`}}/></div></div>)}</div></section></div></div>}

      {activeTab === 'approvals' && <div className="space-y-6"><section><h2 className="section-title mb-3">Pending Review</h2>{pending.length===0?<div className="empty-state"><CheckCircle size={30} className="text-green-400"/><h3 className="font-bold">All caught up!</h3><p className="text-sm text-slate-400">No resources pending approval.</p></div>:<div className="space-y-3">{pending.map((resource)=><article key={resource.id} className="card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><h3 className="font-bold text-sm">{resource.title}</h3><div className="mt-1 flex flex-wrap items-center gap-2"><span className="badge badge-yellow">Pending</span><span className="badge badge-blue">{resource.type}</span><span className="badge badge-gray">Sem {resource.semester}</span><span className="text-[11px] text-slate-400">{resource.fileType} · {resource.fileSize}</span></div><p className="mt-1.5 text-xs text-slate-500">{resource.subject} · {resource.department} · Uploaded {resource.uploadedAt}</p><p className="text-xs text-slate-500">By {resource.uploadedBy} ({resource.uploadedByRole})</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{resource.description}</p></div><div className="flex flex-wrap gap-2"><button className="btn-secondary text-xs" onClick={()=>onSelectResource?.(resource.id)}><Eye size={13}/>View</button><button className="rounded-xl bg-green-500 px-3 py-2 text-xs font-bold text-white" onClick={()=>approve(resource)}><CheckCircle size={13}/>Approve</button><button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-500" onClick={()=>{setRejecting(resource);setRejectionReason('');}}><XCircle size={13}/>Reject</button></div></div></article>)}</div>}</section>
        <section><h2 className="section-title mb-3">Rejected Resources</h2>{rejected.length===0?<p className="card p-4 text-sm text-slate-400">No rejected resources.</p>:<div className="space-y-2">{rejected.map((resource)=><div key={resource.id} className="card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold text-sm">{resource.title}</p><p className="text-xs text-slate-500">{resource.uploadedBy} · {resource.subject} · {resource.department}</p>{resource.rejectionReason&&<p className="mt-1 text-xs text-red-600">Reason: {resource.rejectionReason}</p>}</div><span className="badge badge-red">Rejected</span></div>)}</div>}</section></div>}

      {activeTab === 'users' && <div className="card overflow-hidden"><div className="hidden grid-cols-[1.2fr_1.5fr_.7fr_1.2fr_.7fr_.8fr_1fr] gap-3 border-b bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase text-slate-400 md:grid"><span>Name</span><span>Email</span><span>Role</span><span>Department / Program</span><span className="text-center">Uploads</span><span className="text-center">Status</span><span className="text-center">Actions</span></div>{userRows.map((user)=><div key={user.id} className="border-b border-slate-50 p-4 last:border-0 md:grid md:grid-cols-[1.2fr_1.5fr_.7fr_1.2fr_.7fr_.8fr_1fr] md:items-center md:gap-3 md:px-5"><div><p className="font-semibold text-sm">{user.name}</p><p className="text-[11px] text-slate-400 md:hidden">{user.email}</p></div><span className="hidden truncate text-xs text-slate-500 md:block">{user.email}</span><span className={`badge my-1 w-fit ${user.role==='teacher'?'badge-purple':user.role==='admin'?'badge-gray':'badge-blue'}`}>{user.role}</span><span className="block text-xs text-slate-600">{user.department} · {user.role==='student'?`Semester ${user.semester??'—'}`:user.designation??'—'}</span><span className="text-xs text-slate-600 md:text-center">{user.uploads} uploads</span><span className={`badge my-1 w-fit ${user.accountStatus==='disabled'?'badge-red':'badge-green'}`}>{user.accountStatus==='disabled'?'Disabled':'Active'}</span><div className="flex gap-2 md:justify-center"><button className="btn-ghost text-xs" onClick={()=>setSelectedUserId(user.id)}>View</button>{user.role!=='admin'&&user.id!==currentUser.id&&<button className="btn-secondary text-xs" onClick={()=>toggleUser(user.id,user.accountStatus==='disabled'?'active':'disabled')}>{user.accountStatus==='disabled'?<><UserCheck size={12}/>Enable</>:<><UserX size={12}/>Disable</>}</button>}</div></div>)}</div>}

      {activeTab === 'reports' && <div className="space-y-4">{reports.length===0?<div className="empty-state"><Flag size={28} className="text-slate-300"/><h3 className="font-bold">No reports yet</h3><p className="text-sm text-slate-400">Reports submitted on resource details will appear here.</p></div>:reports.map((report)=><article key={report.id} className="card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><Flag size={14} className="text-red-400"/><h3 className="font-bold text-sm">{report.resourceTitle}</h3><span className={`badge ${report.status==='open'?'badge-yellow':report.status==='removed'?'badge-red':'badge-gray'}`}>{report.status}</span></div><p className="text-xs text-slate-500">Reported by <strong>{report.reporterName}</strong> · {report.reason} · {report.createdAt}</p>{report.description&&<p className="mt-2 text-sm text-slate-600">{report.description}</p>}</div><div className="flex flex-wrap gap-2">{resources.some((resource)=>resource.id===report.resourceId)&&<button className="btn-secondary text-xs" onClick={()=>onSelectResource?.(report.resourceId)}><Eye size={12}/>View</button>}{report.status==='open'&&<><button className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700" onClick={()=>dismissReport(report)}><CheckCircle size={12}/>Dismiss</button><button className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white" onClick={()=>{setRemovingReport(report);setActionError('');}}><Trash2 size={12}/>Remove Resource</button></>}</div></div></article>)}</div>}

      {rejecting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section className="card w-full max-w-md p-6"><h2 className="text-lg font-bold">Reject Resource</h2><p className="mt-1 text-sm text-slate-500">{rejecting.title}</p><label className="label mt-4 block">Reason (optional)<textarea className="input-field mt-1" rows={3} maxLength={300} value={rejectionReason} onChange={(event)=>setRejectionReason(event.target.value)} placeholder="Briefly explain what needs attention"/></label><div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={()=>setRejecting(null)}>Cancel</button><button className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white" onClick={reject}>Reject Resource</button></div></section></div>}
      {removingReport && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section className="card w-full max-w-md p-6"><h2 className="text-lg font-bold">Remove reported resource?</h2><p className="mt-2 text-sm text-slate-500">This permanently removes “{removingReport.resourceTitle}” and clears its stored file when available. Related reports will be marked removed.</p><div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={()=>setRemovingReport(null)}>Cancel</button><button className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white" onClick={removeReportedResource}>Remove Resource</button></div></section></div>}
      {selectedUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section className="card w-full max-w-md p-6"><h2 className="text-lg font-bold">User Details</h2><p className="mt-3 font-semibold">{selectedUser.name}</p><p className="text-sm text-slate-500">{selectedUser.email}</p><p className="mt-3 text-sm">{selectedUser.role} · {selectedUser.department}</p><p className="text-sm text-slate-500">{selectedUser.role==='student'?`Semester ${selectedUser.semester??'—'}`:selectedUser.designation??'—'} · {selectedUser.accountStatus??'active'}</p><button className="btn-secondary mt-5 w-full justify-center" onClick={()=>setSelectedUserId(null)}>Close</button></section></div>}
    </main>
  </div>;
}
