import { useState } from 'react';
import {
  Search, Upload, BookOpen, Download, Heart, ArrowRight,
  TrendingUp, Clock, Zap, MessageSquare, GraduationCap, Users,
} from 'lucide-react';
import TopBar from '../components/TopBar';
import ResourceCard from '../components/ResourceCard';
import type { View } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';
import { canAccessResource } from '../utils/resourceAccess';
import { useFavoriteResourceCount } from '../hooks/useFavoriteResourceCount';

interface DashboardProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  onSelectResource: (id: string) => void;
  notifCount: number;
  onSearch?: (query: string) => void;
}

export default function Dashboard({ onNavigate, onMobileMenuOpen, onSelectResource, notifCount, onSearch }: DashboardProps) {
  const { currentUser, resources, resourceRequests, classrooms, users, notifications, reports, isAuthenticated, authLoading } = useCampusFlow();
  const favoriteSummary = useFavoriteResourceCount(resources.filter((resource) => resource.isFavorited).length, currentUser.id, isAuthenticated, authLoading);
  const [search, setSearch] = useState('');
  const userUploads = resources.filter((resource) => resource.uploadedById === currentUser.id || (!resource.uploadedById && resource.uploadedBy === currentUser.name));
  const dashboardClassrooms = currentUser.role === 'student'
    ? classrooms.filter((classroom) => classroom.memberIds?.includes(currentUser.id) || classroom.joinedBy?.includes(currentUser.id))
    : classrooms.filter((classroom) => classroom.teacherId === currentUser.id || classroom.createdBy === currentUser.id || classroom.teacher === currentUser.name);
  const accessibleResources = resources.filter((resource) => canAccessResource(resource, currentUser, classrooms));
  const recentResources = accessibleResources.slice(0, 4);
  const popularResources = [...accessibleResources].sort((a, b) => b.downloads - a.downloads).slice(0, 3);
  const quickActions = currentUser.role === 'admin'
    ? [
        { label: 'Browse Resources', desc: 'Review the resource library', icon: BookOpen, color: 'bg-purple-600', view: 'browse' as View },
        { label: 'Admin Dashboard', desc: 'Manage approvals and users', icon: Users, color: 'bg-blue-600', view: 'admin' as View },
      ]
    : currentUser.role === 'teacher'
      ? [
          { label: 'Upload Resource', desc: 'Share verified course materials', icon: Upload, color: 'bg-blue-600', view: 'upload' as View },
          { label: 'Browse Resources', desc: 'Find study materials', icon: BookOpen, color: 'bg-purple-600', view: 'browse' as View },
          { label: 'Classroom', desc: 'Create or manage a class', icon: GraduationCap, color: 'bg-green-600', view: 'classroom' as View },
          { label: 'My Uploads', desc: 'Review your shared materials', icon: Upload, color: 'bg-orange-500', view: 'my-uploads' as View },
        ]
      : [
          { label: 'Upload Resource', desc: 'Share your notes & materials', icon: Upload, color: 'bg-blue-600', view: 'upload' as View },
          { label: 'Browse Resources', desc: 'Find study materials', icon: BookOpen, color: 'bg-purple-600', view: 'browse' as View },
          { label: 'Request Resource', desc: 'Can\'t find what you need?', icon: MessageSquare, color: 'bg-orange-500', view: 'requests' as View },
          { label: 'Join Classroom', desc: 'Enter a classroom code', icon: GraduationCap, color: 'bg-green-600', view: 'classroom' as View },
        ];
  const stats = currentUser.role === 'admin'
    ? [
        { label: 'Total Users', value: users.length, icon: Users, change: 'Local demo profiles', colorClass: 'blue' },
        { label: 'Total Resources', value: resources.length, icon: BookOpen, change: 'Across CampusFlow', colorClass: 'purple' },
        { label: 'Pending Approvals', value: resources.filter((r) => r.verified === 'pending').length, icon: Clock, change: 'Awaiting review', colorClass: 'orange' },
        { label: 'Reports', value: reports.filter((report) => report.status === 'open').length, icon: MessageSquare, change: 'Open reports', colorClass: 'green' },
        { label: 'Platform Activity', value: notifications.length, icon: TrendingUp, change: 'Notifications recorded', colorClass: 'orange' },
      ]
    : currentUser.role === 'teacher'
      ? [
          { label: 'Resources Available', value: resources.length, icon: BookOpen, change: 'In the shared library', colorClass: 'blue' },
          { label: 'My Uploads', value: userUploads.length, icon: Upload, change: 'Resources shared by you', colorClass: 'purple' },
          { label: 'Downloads', value: currentUser.downloads, icon: Download, change: 'On your account', colorClass: 'orange' },
          { label: 'Classrooms Created', value: classrooms.filter((c) => c.teacher === currentUser.name).length, icon: GraduationCap, change: 'Your teaching spaces', colorClass: 'green' },
          { label: 'Pending Activity', value: userUploads.filter((r) => r.verified === 'pending').length, icon: Clock, change: 'Uploads awaiting review', colorClass: 'orange' },
        ]
      : [
          { label: 'Resources Available', value: resources.length, icon: BookOpen, change: 'In the shared library', colorClass: 'blue' },
          { label: 'My Uploads', value: userUploads.length, icon: Upload, change: 'Resources shared by you', colorClass: 'purple' },
          { label: 'Favorites', value: favoriteSummary.count, icon: Heart, change: 'Saved resources', colorClass: 'green' },
          { label: 'Downloads', value: currentUser.downloads, icon: Download, change: 'On your account', colorClass: 'orange' },
          { label: 'Resource Requests', value: resourceRequests.length, icon: MessageSquare, change: 'Community requests', colorClass: 'blue' },
          { label: 'Joined Classrooms', value: dashboardClassrooms.length, icon: GraduationCap, change: 'Your learning spaces', colorClass: 'purple' },
        ];

  const handleSearchSubmit = () => {
    if (onSearch) {
      onSearch(search);
    } else {
      onNavigate('browse');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <TopBar
        title="Dashboard"
        onMobileMenuOpen={onMobileMenuOpen}
        onNavigate={onNavigate}
        notifCount={notifCount}
        onSearch={onSearch}
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
        {favoriteSummary.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Could not load saved-resource count: {favoriteSummary.error}</p>}
        {/* Welcome + search */}
        <div className="bg-gradient-to-r from-[#0B1E40] to-[#1E40AF] rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 opacity-5">
            <svg viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="80" fill="none" stroke="white" strokeWidth="2" />
              <circle cx="100" cy="100" r="50" fill="none" stroke="white" strokeWidth="2" />
              <circle cx="100" cy="100" r="20" fill="white" />
              <line x1="20" y1="100" x2="80" y2="100" stroke="white" strokeWidth="1" />
              <line x1="120" y1="100" x2="180" y2="100" stroke="white" strokeWidth="1" />
              <line x1="100" y1="20" x2="100" y2="80" stroke="white" strokeWidth="1" />
              <line x1="100" y1="120" x2="100" y2="180" stroke="white" strokeWidth="1" />
            </svg>
          </div>
          <div className="relative">
            <p className="text-blue-300 text-sm font-medium mb-1">{currentUser.role === 'admin' ? 'Platform overview' : 'Good to see you 👋'}</p>
            <h2 className="text-xl md:text-2xl font-extrabold mb-1">Welcome back, {currentUser.name}!</h2>
            <p className="text-blue-200 text-sm mb-5">{currentUser.department}{currentUser.role === 'student' ? ` · Semester ${currentUser.semester ?? '—'}` : ` · ${currentUser.designation ?? currentUser.role}`}</p>
            <div className="search-bar-container max-w-lg">
              <Search size={15} className="left-3.5" />
              <input
                type="text"
                placeholder="Search notes, subjects, question papers..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-blue-300 text-sm outline-none focus:bg-white/15 focus:border-white/40 transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                onClick={handleSearchSubmit}
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className={`stat-card ${stat.colorClass}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">{stat.label}</p>
                  <p className="text-2xl font-extrabold text-[#0F172A] font-mono">{stat.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  stat.colorClass === 'blue' ? 'bg-blue-50 text-blue-600' :
                  stat.colorClass === 'purple' ? 'bg-purple-50 text-purple-600' :
                  stat.colorClass === 'green' ? 'bg-green-50 text-green-600' :
                  'bg-orange-50 text-orange-600'
                }`}>
                  <stat.icon size={18} />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">{stat.change}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Quick Actions</h2>
          </div>
          <div className={`grid grid-cols-2 ${quickActions.length > 4 ? 'lg:grid-cols-3' : 'md:grid-cols-4'} gap-3`}>
            {quickActions.map((action) => (
              <button
                key={action.label}
                className="card p-4 card-hover text-left flex flex-col gap-2.5"
                onClick={() => onNavigate(action.view)}
              >
                <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center`}>
                  <action.icon size={18} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-[13px] text-[#0F172A]">{action.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{action.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recently Added */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-blue-500" />
                <h2 className="section-title">Recently Added</h2>
              </div>
              <button
                className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:text-blue-700"
                onClick={() => onNavigate('browse')}
              >
                View All <ArrowRight size={12} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recentResources.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  onClick={() => onSelectResource(r.id)}
                  compact
                />
              ))}
            </div>
          </div>

          {/* Sidebar: Popular + Recent activity */}
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-blue-500" />
                <h2 className="section-title">Most Downloaded</h2>
              </div>
              <div className="space-y-2">
                {popularResources.map((r, i) => (
                  <div
                    key={r.id}
                    className="card p-3 card-hover flex items-start gap-3 cursor-pointer"
                    onClick={() => onSelectResource(r.id)}
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#0F172A] line-clamp-2 leading-tight">{r.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{r.downloads.toLocaleString()} downloads</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Zap size={16} className="text-blue-500" />
                <h2 className="section-title">Community Activity</h2>
              </div>
              <div className="card p-4 space-y-3">
                {[
                  { user: 'Prof. A. Desai', action: 'uploaded', res: 'ML Lab Manual Exp 12', time: '15m', color: 'bg-green-500' },
                  { user: 'Sneha J.', action: 'downloaded', res: 'DBMS Question Papers', time: '32m', color: 'bg-blue-500' },
                  { user: 'Rahul V.', action: 'requested', res: 'CN Practicals PDF', time: '1h', color: 'bg-orange-400' },
                  { user: 'Priya N.', action: 'uploaded', res: 'SE Assignment Solutions', time: '2h', color: 'bg-purple-500' },
                ].map((a) => (
                  <div key={a.res} className="flex items-start gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${a.color} mt-1.5 flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-slate-700">{a.user}</p>
                      <p className="text-[10px] text-slate-400 truncate">{a.action} "{a.res}"</p>
                    </div>
                    <span className="text-[10px] text-slate-400 ml-auto flex-shrink-0">{a.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Classroom quick info */}
            {currentUser.role !== 'admin' && <div
              className="bg-gradient-to-br from-[#0B1E40] to-[#153470] rounded-2xl p-4 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => onNavigate('classroom')}
            >
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap size={16} className="text-blue-300" />
                <p className="text-white font-bold text-sm">My Classrooms</p>
              </div>
              {dashboardClassrooms.slice(0, 2).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
                  <div><p className="text-white text-xs font-bold">{c.code}</p><p className="text-blue-300 text-[10px]">{c.subject}</p></div>
                  <div className="flex items-center gap-1 text-blue-300 text-[10px]"><Users size={10} /><span>{c.members}</span></div>
                </div>
              ))}
              <button className="flex items-center gap-1 text-blue-300 text-xs font-medium mt-2.5 hover:text-white transition-colors">
                View All <ArrowRight size={11} />
              </button>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
