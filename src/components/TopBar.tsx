import { useState } from 'react';
import { Menu, Bell, Search } from 'lucide-react';
import Logo from './Logo';
import type { View } from '../types';

interface TopBarProps {
  title: string;
  onMobileMenuOpen: () => void;
  onNavigate: (view: View) => void;
  notifCount: number;
  onSearch?: (query: string) => void;
}

export default function TopBar({ title, onMobileMenuOpen, onNavigate, notifCount, onSearch }: TopBarProps) {
  const [query, setQuery] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      if (onSearch) {
        onSearch(query.trim());
      } else {
        onNavigate('browse');
      }
    }
  };

  return (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[#E8F0FE] px-4 py-3 flex items-center gap-3">
      <button
        className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
        onClick={onMobileMenuOpen}
      >
        <Menu size={20} className="text-slate-600" />
      </button>

      <div className="lg:hidden">
        <Logo size="sm" variant="dark" />
      </div>

      <h1 className="hidden lg:block page-title">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Quick search..."
            className="input-field pl-9 w-48 text-sm py-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
          onClick={() => onNavigate('notifications')}
        >
          <Bell size={18} className="text-slate-600" />
          {notifCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {notifCount}
            </span>
          )}
        </button>
        <div
          className="avatar w-8 h-8 text-xs cursor-pointer"
          onClick={() => onNavigate('profile')}
        >
          AM
        </div>
      </div>
    </div>
  );
}
