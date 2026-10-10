import { useEffect, useState } from 'react';
import { MessageSquare, Plus, CheckCircle, Clock, X, Send, Upload } from 'lucide-react';
import TopBar from '../components/TopBar';
import { subjects, resourceTypes } from '../data/mockData';
import type { View, ResourceRequest } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { createResourceRequest, fetchResourceRequests, resourceRequestRowToResourceRequest } from '../lib/resourceRequests';

interface RequestsProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  notifCount: number;
  onSearch?: (query: string) => void;
}

const statusConfig = {
  open: { label: 'Open', badge: 'badge-blue', icon: Clock },
  fulfilled: { label: 'Fulfilled', badge: 'badge-green', icon: CheckCircle },
  closed: { label: 'Closed', badge: 'badge-gray', icon: X },
};

export default function ResourceRequests({ onNavigate, onMobileMenuOpen, notifCount, onSearch }: RequestsProps) {
  const { resourceRequests: localRequests, setResourceRequests, currentUser, isAuthenticated, authLoading } = useCampusFlow();
  const [databaseRequests, setDatabaseRequests] = useState<ResourceRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(isSupabaseConfigured);
  const [requestsError, setRequestsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'open' | 'fulfilled'>('all');
  const [newRequest, setNewRequest] = useState({
    title: '',
    subject: '',
    description: '',
    semester: '',
    type: '',
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setRequestsLoading(false);
      setRequestsError('');
      return;
    }
    if (authLoading) {
      setRequestsLoading(true);
      return;
    }
    if (!isAuthenticated) {
      setDatabaseRequests([]);
      setRequestsError('Sign in to load and submit resource requests.');
      setRequestsLoading(false);
      return;
    }
    let active = true;
    setRequestsLoading(true);
    setRequestsError('');
    void fetchResourceRequests().then((rows) => {
      if (active) setDatabaseRequests(rows.map(resourceRequestRowToResourceRequest));
    }).catch((loadError: unknown) => {
      if (!active) return;
      setDatabaseRequests([]);
      setRequestsError(loadError instanceof Error ? loadError.message : 'Could not load resource requests.');
    }).finally(() => { if (active) setRequestsLoading(false); });
    return () => { active = false; };
  }, [currentUser.id, isAuthenticated, authLoading]);

  const requests = isSupabaseConfigured ? databaseRequests : localRequests;

  const filtered = activeTab === 'all' ? requests : requests.filter((r) => r.status === activeTab);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSupabaseConfigured) {
      setRequestsError('');
      setSubmitting(true);
      try {
        const row = await createResourceRequest({
          title: newRequest.title,
          subject: newRequest.subject,
          description: newRequest.description,
          semester: parseInt(newRequest.semester, 10) || 5,
          type: (newRequest.type || 'Notes') as ResourceRequest['type'],
        });
        const created = resourceRequestRowToResourceRequest(row);
        setDatabaseRequests((previous) => [created, ...previous.filter((request) => request.id !== created.id)]);
        setShowForm(false);
        setNewRequest({ title: '', subject: '', description: '', semester: '', type: '' });
      } catch (submitError) {
        setRequestsError(submitError instanceof Error ? submitError.message : 'Could not submit the resource request.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const req: ResourceRequest = {
      id: `req${Date.now()}`,
      title: newRequest.title,
      subject: newRequest.subject,
      description: newRequest.description,
      semester: parseInt(newRequest.semester) || 5,
      type: (newRequest.type || 'Notes') as ResourceRequest['type'],
      requestedBy: currentUser.name,
      requestedAt: 'Just now',
      status: 'open',
      responses: 0,
    };
    setResourceRequests([req, ...requests]);
    setShowForm(false);
    setNewRequest({ title: '', subject: '', description: '', semester: '', type: '' });
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <TopBar
        title="Resource Requests"
        onMobileMenuOpen={onMobileMenuOpen}
        onNavigate={onNavigate}
        notifCount={notifCount}
        onSearch={onSearch}
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-slate-500">
            Can't find what you need? Submit a request and the community will help.
          </p>
          <button className="btn-primary text-sm py-2.5 px-5" onClick={() => setShowForm(!showForm)} disabled={isSupabaseConfigured && (!isAuthenticated || authLoading)}>
            <Plus size={14} />
            New Request
          </button>
        </div>
        {requestsError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{requestsError}</p>}
        {requestsLoading && <p role="status" className="mb-4 text-sm text-slate-500">Loading resource requests…</p>}

        {/* Request form */}
        {showForm && (
          <div className="card p-5 mb-5 border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Submit Resource Request</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Request Title *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., DBMS Unit 3 Notes — Normalization"
                  value={newRequest.title}
                  onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="label">Subject *</label>
                  <select
                    className="input-field"
                    value={newRequest.subject}
                    onChange={(e) => setNewRequest({ ...newRequest, subject: e.target.value })}
                    required
                  >
                    <option value="">Select subject</option>
                    {subjects.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Semester</label>
                  <select
                    className="input-field"
                    value={newRequest.semester}
                    onChange={(e) => setNewRequest({ ...newRequest, semester: e.target.value })}
                  >
                    <option value="">Any</option>
                    {[1,2,3,4,5,6,7,8].map((s) => <option key={s} value={s}>Semester {s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Resource Type</label>
                  <select
                    className="input-field"
                    value={newRequest.type}
                    onChange={(e) => setNewRequest({ ...newRequest, type: e.target.value })}
                  >
                    <option value="">Any</option>
                    {resourceTypes.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input-field resize-none"
                  rows={2}
                  placeholder="Be specific about what you need — chapters, topics, format..."
                  value={newRequest.description}
                  onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  <Send size={14} />
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(['all', 'open', 'fulfilled'] as const).map((tab) => (
            <button
              key={tab}
              className={`tab-pill capitalize ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              <span className="ml-1 text-[10px] bg-white/20 rounded-full px-1.5">
                {tab === 'all' ? requests.length : requests.filter((r) => r.status === tab).length}
              </span>
            </button>
          ))}
        </div>

        {/* Requests list */}
        <div className="space-y-3">
          {!requestsLoading && !requestsError && filtered.length === 0 && <p className="card p-6 text-center text-sm text-slate-500">No resource requests to show.</p>}
          {filtered.map((req) => {
            const status = statusConfig[req.status];
            const StatusIcon = status.icon;

            return (
              <div key={req.id} className="card p-5 card-hover cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    req.status === 'open' ? 'bg-blue-50' : req.status === 'fulfilled' ? 'bg-green-50' : 'bg-slate-100'
                  }`}>
                    <MessageSquare size={18} className={
                      req.status === 'open' ? 'text-blue-600' : req.status === 'fulfilled' ? 'text-green-600' : 'text-slate-400'
                    } />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h3 className="font-bold text-[13px] text-[#0F172A] leading-tight">{req.title}</h3>
                      <span className={`badge ${status.badge} flex items-center gap-1 flex-shrink-0`}>
                        <StatusIcon size={10} />
                        {status.label}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500 mt-1 line-clamp-2">{req.description}</p>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <span className="badge badge-blue">{req.subject}</span>
                      <span className="badge badge-gray">{req.type}</span>
                      <span className="badge badge-gray">Sem {req.semester}</span>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 ml-auto">
                        <MessageSquare size={10} />
                        <span>{req.responses} responses</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[11px] text-slate-400">
                        Requested by <span className="font-medium text-slate-500">{req.requestedBy}</span> · {req.requestedAt}
                      </p>
                      {req.status === 'open' && (
                        <button className="btn-primary text-xs py-1.5 px-3 rounded-lg flex items-center gap-1">
                          <Upload size={11} />
                          Fulfill Request
                        </button>
                      )}
                      {req.status === 'fulfilled' && (
                        <button className="text-xs text-green-600 font-semibold flex items-center gap-1">
                          <CheckCircle size={11} />
                          View Responses
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
