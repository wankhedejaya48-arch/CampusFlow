import { Download, Eye, Star, Heart, BookOpen, FileText, FlaskConical, Presentation, ClipboardList, BookMarked, File, BadgeCheck } from 'lucide-react';
import type { Resource } from '../types';

interface ResourceCardProps {
  resource: Resource;
  onClick?: () => void;
  onFavorite?: (id: string) => void;
  compact?: boolean;
}

const typeConfig: Record<string, { icon: React.FC<{ size?: number; className?: string }>, color: string, bg: string }> = {
  'Notes': { icon: BookOpen as React.FC<{ size?: number; className?: string }>, color: 'text-blue-600', bg: 'bg-blue-50' },
  'Previous Year Questions': { icon: ClipboardList as React.FC<{ size?: number; className?: string }>, color: 'text-purple-600', bg: 'bg-purple-50' },
  'Assignment': { icon: FileText as React.FC<{ size?: number; className?: string }>, color: 'text-orange-600', bg: 'bg-orange-50' },
  'Lab Manual': { icon: FlaskConical as React.FC<{ size?: number; className?: string }>, color: 'text-green-600', bg: 'bg-green-50' },
  'Presentation': { icon: Presentation as React.FC<{ size?: number; className?: string }>, color: 'text-red-600', bg: 'bg-red-50' },
  'Reference Material': { icon: BookMarked as React.FC<{ size?: number; className?: string }>, color: 'text-teal-600', bg: 'bg-teal-50' },
  'Other': { icon: File as React.FC<{ size?: number; className?: string }>, color: 'text-slate-600', bg: 'bg-slate-50' },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={11}
          className={i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'}
        />
      ))}
    </div>
  );
}

export default function ResourceCard({ resource, onClick, onFavorite, compact = false }: ResourceCardProps) {
  const config = typeConfig[resource.type] || typeConfig['Other'];
  const TypeIcon = config.icon;

  return (
    <div className="resource-card" onClick={onClick}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
          <TypeIcon size={18} className={config.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <h3 className="font-semibold text-[13px] text-[#0F172A] leading-tight line-clamp-2 flex-1">
              {resource.title}
            </h3>
            {resource.verified === 'verified' && (
              <BadgeCheck size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
            )}
          </div>
          <p className="text-[12px] text-[#64748B]">{resource.subject}</p>
        </div>
      </div>

      {!compact && (
        <p className="text-[12px] text-[#64748B] mb-3 line-clamp-2">{resource.description}</p>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="badge badge-blue">{resource.type}</span>
        <span className="badge badge-gray">Sem {resource.semester}</span>
        {resource.verified === 'pending' && (
          <span className="badge badge-yellow">Pending</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Eye size={11} />
            <span className="font-mono">{resource.views.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Download size={11} />
            <span className="font-mono">{resource.downloads.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <StarRating rating={resource.rating} />
            <span className="text-[11px] text-slate-400 font-mono">{resource.rating}</span>
          </div>
        </div>
        <button
          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
          onClick={(e) => { e.stopPropagation(); onFavorite?.(resource.id); }}
        >
          <Heart
            size={14}
            className={resource.isFavorited ? 'fill-red-400 text-red-400' : 'text-slate-300'}
          />
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="avatar w-5 h-5 text-[8px]">
            {resource.uploadedBy.split(' ').map(w => w[0]).join('').slice(0, 2)}
          </div>
          <span className="text-[11px] text-slate-400">{resource.uploadedBy}</span>
        </div>
        <span className="text-[11px] text-slate-400">{resource.uploadedAt}</span>
      </div>
    </div>
  );
}
