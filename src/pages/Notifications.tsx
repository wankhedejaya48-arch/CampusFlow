import { useState } from 'react';
import { Bell, Upload, MessageSquare, GraduationCap, BadgeCheck, Download, Megaphone, Check, Trash2 } from 'lucide-react';
import TopBar from '../components/TopBar';
import { notifications as initialNotifs } from '../data/mockData';
import type { View, Notification } from '../types';

interface NotificationsProps {
  onNavigate: (view: View) => void;
  onMobileMenuOpen: () => void;
  notifCount: number;
  notificationsList?: Notification[];
  loading?: boolean;
  error?: string;
  onMarkRead?: (id: string) => void;
  onMarkAllRead: () => void;
  onDeleteNotif?: (id: string) => void;
  onSearch?: (query: string) => void;
}

const typeConfig = {
  upload: { icon: Upload, color: 'bg-blue-50 text-blue-600' },
  request: { icon: MessageSquare, color: 'bg-orange-50 text-orange-600' },
  classroom: { icon: GraduationCap, color: 'bg-purple-50 text-purple-600' },
  verification: { icon: BadgeCheck, color: 'bg-green-50 text-green-600' },
  download: { icon: Download, color: 'bg-teal-50 text-teal-600' },
  announcement: { icon: Megaphone, color: 'bg-pink-50 text-pink-600' },
};

export default function Notifications({
  onNavigate,
  onMobileMenuOpen,
  notifCount,
  notificationsList,
  loading = false,
  error = '',
  onMarkRead,
  onMarkAllRead,
  onDeleteNotif,
  onSearch,
}: NotificationsProps) {
  const [localNotifs, setLocalNotifs] = useState<Notification[]>(() => notificationsList === undefined ? initialNotifs : []);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  const notifs = notificationsList ?? localNotifs;
  const unreadCount = notifs.filter((n) => !n.read).length;
  const displayed = activeTab === 'unread' ? notifs.filter((n) => !n.read) : notifs;

  const markRead = (id: string) => {
    if (onMarkRead) {
      onMarkRead(id);
    } else {
      setLocalNotifs(localNotifs.map((n) => (n.id === id ? { ...n, read: true } : n)));
    }
  };

  const markAllRead = () => {
    if (!notificationsList) {
      setLocalNotifs(localNotifs.map((n) => ({ ...n, read: true })));
    }
    onMarkAllRead();
  };

  const deleteNotif = (id: string) => {
    if (onDeleteNotif) {
      onDeleteNotif(id);
    } else {
      setLocalNotifs(localNotifs.filter((n) => n.id !== id));
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <TopBar
        title="Notifications"
        onMobileMenuOpen={onMobileMenuOpen}
        onNavigate={onNavigate}
        notifCount={notifCount}
        onSearch={onSearch}
      />

      <div className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {(['all', 'unread'] as const).map((tab) => (
                <button
                  key={tab}
                  className={`tab-pill capitalize ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                  {tab === 'unread' && unreadCount > 0 && (
                    <span className="ml-1 w-4 h-4 bg-blue-500 text-white rounded-full text-[10px] inline-flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button
                className="flex items-center gap-1.5 text-sm text-blue-600 font-semibold hover:text-blue-700 transition-colors"
                onClick={markAllRead}
              >
                <Check size={14} />
                Mark all read
              </button>
            )}
          </div>

          {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loading ? (
            <p role="status" className="py-8 text-center text-sm text-slate-500">Loading notifications…</p>
          ) : error ? (
            <p className="py-6 text-center text-sm text-slate-500">Notifications could not be loaded.</p>
          ) : displayed.length === 0 && !error ? (
            <div className="empty-state">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Bell size={28} className="text-slate-300" />
              </div>
              <h3 className="font-bold text-[#0F172A]">All caught up!</h3>
              <p className="text-sm text-slate-400">No {activeTab === 'unread' ? 'unread ' : ''}notifications to show.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayed.map((notif) => {
                const config = typeConfig[notif.type];
                const Icon = config.icon;
                return (
                  <div
                    key={notif.id}
                    className={`notification-item group ${notif.read ? '' : 'unread'}`}
                    onClick={() => markRead(notif.id)}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold text-[#0F172A] leading-tight ${!notif.read ? 'font-bold' : ''}`}>
                            {notif.title}
                          </p>
                          <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{notif.message}</p>
                          <p className="text-[11px] text-slate-400 mt-1">{notif.time}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!notif.read && (
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                          )}
                          <button
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg transition-all text-slate-300 hover:text-red-400"
                            onClick={(e) => { e.stopPropagation(); deleteNotif(notif.id); }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
