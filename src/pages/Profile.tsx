import { useEffect, useState } from 'react';
import { Edit2, Upload, Download, BookOpen, Star, Save, X, Camera } from 'lucide-react';
import TopBar from '../components/TopBar';
import type { View } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';
import { useFavoriteResourceCount } from '../hooks/useFavoriteResourceCount';

interface ProfileProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  notifCount: number;
  onSearch?: (query: string) => void;
}

export default function Profile({ onNavigate, onMobileMenuOpen, notifCount, onSearch }: ProfileProps) {
  const { currentUser, resources, updateCurrentUser, isAuthenticated, authLoading } = useCampusFlow();
  const favoriteSummary = useFavoriteResourceCount(resources.filter((resource) => resource.isFavorited).length, currentUser.id, isAuthenticated, authLoading);
  const [editing, setEditing] = useState(false);
  const [profileError, setProfileError] = useState('');
  const myUploads = resources.filter((resource) => resource.uploadedById === currentUser.id || (!resource.uploadedById && resource.uploadedBy === currentUser.name));
  const [userData, setUserData] = useState({
    name: currentUser.name,
    email: currentUser.email,
    department: currentUser.department,
    semester: currentUser.semester || 5,
    designation: currentUser.designation || 'Professor',
    bio: currentUser.bio ?? '',
  });

  useEffect(() => {
    setUserData((previous) => ({ ...previous, name: currentUser.name, email: currentUser.email, department: currentUser.department, semester: currentUser.semester ?? 1, designation: currentUser.designation ?? '', bio: currentUser.bio ?? '' }));
  }, [currentUser]);

  const saveProfile = async () => {
    if (!userData.name.trim() || !userData.department.trim()) { setProfileError('Name and department are required.'); return; }
    try {
      await updateCurrentUser({
        name: userData.name.trim(),
        department: userData.department.trim(),
        avatarInitials: userData.name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
        semester: currentUser.role === 'student' ? userData.semester : undefined,
        designation: currentUser.role === 'teacher' ? userData.designation.trim() : undefined,
        bio: userData.bio.trim(),
      });
      setProfileError('');
      setEditing(false);
    } catch {
      setProfileError('Unable to save profile changes. Please try again.');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <TopBar
        title="My Profile"
        onMobileMenuOpen={onMobileMenuOpen}
        onNavigate={onNavigate}
        notifCount={notifCount}
        onSearch={onSearch}
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8">
        {favoriteSummary.error && <p role="alert" className="mx-auto mb-4 max-w-3xl rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Could not load saved-resource count: {favoriteSummary.error}</p>}
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Profile card */}
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-800 flex items-center justify-center text-white text-2xl font-extrabold">
                    {currentUser.avatarInitials}
                  </div>
                  {editing && (
                    <button className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors">
                      <Camera size={13} className="text-white" />
                    </button>
                  )}
                </div>
                <div>
                  {editing ? (
                    <input
                      className="input-field text-lg font-bold mb-1 py-1"
                      value={userData.name}
                      onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                    />
                  ) : (
                    <h2 className="text-xl font-extrabold text-[#0F172A]">{userData.name}</h2>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className="badge badge-blue capitalize">{currentUser.role}</span>
                    <span className="badge badge-gray">{userData.department}</span>
                    <span className="badge badge-gray">{currentUser.role === 'student' ? `Semester ${userData.semester}` : userData.designation}</span>
                  </div>
                  {!editing && (
                    <p className="text-sm text-slate-500 mt-2 max-w-sm leading-relaxed">{userData.bio}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <button className="btn-ghost text-sm py-2 px-4" onClick={() => setEditing(false)}>
                      <X size={14} />Cancel
                    </button>
                    <button className="btn-primary text-sm py-2 px-4" onClick={saveProfile}>
                      <Save size={14} />Save
                    </button>
                  </>
                ) : (
                  <button className="btn-secondary text-sm py-2 px-4" onClick={() => setEditing(true)}>
                    <Edit2 size={14} />Edit Profile
                  </button>
                )}
              </div>
            </div>

            {editing && (
              <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
                {profileError && <p role="alert" className="text-sm text-red-600">{profileError}</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Email</label>
                    <input type="email" className="input-field bg-slate-50" value={userData.email} readOnly />
                  </div>
                  <div>
                    <label className="label">Department</label>
                    <input type="text" className="input-field" value={userData.department} onChange={(e) => setUserData({ ...userData, department: e.target.value })} />
                  </div>
                  {currentUser.role === 'student' ? (
                    <div>
                      <label className="label">Semester</label>
                      <select className="input-field" value={userData.semester} onChange={(e) => setUserData({ ...userData, semester: parseInt(e.target.value) })}>
                        {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                      </select>
                    </div>
                  ) : currentUser.role === 'teacher' ? (
                    <div>
                      <label className="label">Teaching Designation</label>
                      <input className="input-field" value={userData.designation} onChange={(e) => setUserData({ ...userData, designation: e.target.value })} />
                    </div>
                  ) : null}
                </div>
                <div>
                  <label className="label">Bio</label>
                  <textarea className="input-field resize-none" rows={2} value={userData.bio} onChange={(e) => setUserData({ ...userData, bio: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Uploads', value: myUploads.length, icon: Upload, color: 'blue' },
              { label: 'Downloads', value: currentUser.downloads, icon: Download, color: 'purple' },
              { label: 'Favorites', value: favoriteSummary.count, icon: BookOpen, color: 'green' },
              { label: 'Avg Rating', value: '4.4', icon: Star, color: 'orange' },
            ].map((s) => (
              <div key={s.label} className={`stat-card ${s.color}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-1 ${
                  s.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                  s.color === 'purple' ? 'bg-purple-50 text-purple-600' :
                  s.color === 'green' ? 'bg-green-50 text-green-600' :
                  'bg-orange-50 text-orange-600'
                }`}>
                  <s.icon size={16} />
                </div>
                <p className="text-xl font-extrabold text-[#0F172A]">{s.value}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Account info */}
          <div className="card p-5">
            <h2 className="section-title mb-4">Account Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {[
                { label: 'Full Name', value: userData.name },
                { label: 'Email Address', value: userData.email },
                { label: 'Role', value: currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1) },
                { label: 'Department', value: userData.department },
                { label: currentUser.role === 'student' ? 'Current Semester' : 'Designation', value: currentUser.role === 'student' ? `Semester ${userData.semester}` : userData.designation },
                { label: 'Member Since', value: currentUser.joinedAt },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="font-semibold text-[#0F172A]">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* My uploads preview */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">My Uploads</h2>
              <button className="text-xs text-blue-600 font-semibold hover:text-blue-700" onClick={() => onNavigate('my-uploads')}>
                View All
              </button>
            </div>
            <div className="space-y-2">
              {myUploads.slice(0, 3).map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Upload size={14} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[#0F172A] truncate">{u.title}</p>
                    <p className="text-[10px] text-slate-400">{u.subject} · {u.uploadedAt}</p>
                  </div>
                  <span className={`badge ${u.verified === 'verified' ? 'badge-green' : 'badge-yellow'} flex-shrink-0`}>
                    {u.verified === 'verified' ? '✅' : '⏳'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Danger zone */}
          <div className="card p-5 border-red-100">
            <h2 className="section-title mb-3 text-red-500">Danger Zone</h2>
            <p className="text-sm text-slate-500 mb-4">Irreversible actions. Proceed with caution.</p>
            <div className="flex gap-3">
              <button className="text-sm font-semibold text-red-500 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50 transition-colors">
                Change Password
              </button>
              <button className="text-sm font-semibold text-red-500 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50 transition-colors">
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
