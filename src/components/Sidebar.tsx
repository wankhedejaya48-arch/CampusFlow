import {
  LayoutDashboard, Search, Upload, FileText, Heart, MessageSquare,
  GraduationCap, Bell, User, Settings, LogOut, X, ChevronRight, Shield,
} from 'lucide-react';
import Logo from './Logo';
import type { View } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  notifCount: number;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const navItems = [
  { label: 'Dashboard', view: 'dashboard' as View, icon: LayoutDashboard },
  { label: 'Browse Resources', view: 'browse' as View, icon: Search },
  { label: 'Upload Resource', view: 'upload' as View, icon: Upload },
  { label: 'My Uploads', view: 'my-uploads' as View, icon: FileText },
  { label: 'Favorites', view: 'favorites' as View, icon: Heart },
  { label: 'Resource Requests', view: 'requests' as View, icon: MessageSquare },
  { label: 'Classroom', view: 'classroom' as View, icon: GraduationCap },
];

const bottomNavItems = [
  { label: 'Notifications', view: 'notifications' as View, icon: Bell },
  { label: 'Profile', view: 'profile' as View, icon: User },
  { label: 'Settings', view: 'profile' as View, icon: Settings },
  { label: 'Admin Panel', view: 'admin' as View, icon: Shield },
];

export default function Sidebar({
  currentView, onNavigate, onLogout, notifCount, mobileOpen, onMobileClose
}: SidebarProps) {
  const { currentUser } = useCampusFlow();
  const roleNav = currentUser.role === 'admin'
    ? navItems.filter((item) => ['dashboard', 'browse'].includes(item.view))
    : currentUser.role === 'teacher'
      ? navItems.filter((item) => item.view !== 'requests')
      : navItems;
  const roleBottomNav = currentUser.role === 'admin'
    ? bottomNavItems
    : bottomNavItems.filter((item) => item.view !== 'admin');
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-white/10">
        <Logo size="sm" variant="light" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 pb-2 pt-1">
          Main Menu
        </p>
        {roleNav.map(({ label, view, icon: Icon }) => (
          <div
            key={view}
            className={`sidebar-nav-item ${currentView === view ? 'active' : ''}`}
            onClick={() => { onNavigate(view); onMobileClose(); }}
          >
            <Icon size={16} strokeWidth={2} />
            <span>{label}</span>
          </div>
        ))}

        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 pb-2 pt-4">
          Account
        </p>
        {roleBottomNav.map(({ label, view, icon: Icon }) => (
          <div
            key={label}
            className={`sidebar-nav-item ${currentView === view && label !== 'Settings' ? 'active' : ''}`}
            onClick={() => { onNavigate(view); onMobileClose(); }}
          >
            <Icon size={16} strokeWidth={2} />
            <span>{label === 'Admin Panel' ? 'Admin Dashboard' : label}</span>
            {label === 'Notifications' && notifCount > 0 && (
              <span className="ml-auto bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {notifCount}
              </span>
            )}
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-xl bg-white/5">
          <div className="avatar w-8 h-8 text-xs flex-shrink-0">{currentUser.avatarInitials}</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
            <p className="text-[11px] text-slate-400 truncate">
              {currentUser.department}{currentUser.role === 'student' ? ` · Semester ${currentUser.semester ?? '—'}` : ` · ${currentUser.designation ?? currentUser.role}`}
            </p>
          </div>
          <ChevronRight size={14} className="text-slate-500 ml-auto flex-shrink-0" />
        </div>
        <div
          className="sidebar-nav-item text-red-400 hover:bg-red-500/10 hover:text-red-300"
          onClick={onLogout}
        >
          <LogOut size={16} strokeWidth={2} />
          <span>Logout</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col w-56 bg-[#0B1E40] h-screen sticky top-0 flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div className="relative w-64 bg-[#0B1E40] h-full z-10 shadow-2xl flex flex-col">
            <button
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
              onClick={onMobileClose}
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}
    </>
  );
}
