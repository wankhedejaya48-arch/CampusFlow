interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
  showTagline?: boolean;
}

export default function Logo({ size = 'md', variant = 'dark', showTagline = false }: LogoProps) {
  const sizes = {
    sm: { icon: 28, text: 16, tagline: 10 },
    md: { icon: 36, text: 20, tagline: 11 },
    lg: { icon: 48, text: 26, tagline: 12 },
  };
  const s = sizes[size];
  const textColor = variant === 'light' ? 'text-white' : 'text-[#0F172A]';
  const taglineColor = variant === 'light' ? 'text-blue-200' : 'text-[#64748B]';

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2.5">
        <div style={{ width: s.icon, height: s.icon }} className="relative flex-shrink-0">
          <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width={s.icon} height={s.icon}>
            <rect width="36" height="36" rx="10" fill="url(#logoGrad)" />
            <circle cx="9" cy="18" r="3.5" fill="white" opacity="0.9" />
            <circle cx="18" cy="9" r="3.5" fill="white" opacity="0.9" />
            <circle cx="27" cy="18" r="3.5" fill="white" opacity="0.9" />
            <circle cx="18" cy="27" r="3.5" fill="white" opacity="0.9" />
            <circle cx="18" cy="18" r="5" fill="white" />
            <line x1="12" y1="18" x2="13" y2="18" stroke="white" strokeWidth="1.5" opacity="0.6" />
            <line x1="23" y1="18" x2="24" y2="18" stroke="white" strokeWidth="1.5" opacity="0.6" />
            <line x1="18" y1="12" x2="18" y2="13" stroke="white" strokeWidth="1.5" opacity="0.6" />
            <line x1="18" y1="23" x2="18" y2="24" stroke="white" strokeWidth="1.5" opacity="0.6" />
            <path d="M12 15L15 12" stroke="white" strokeWidth="1.2" opacity="0.4" strokeLinecap="round" />
            <path d="M24 15L21 12" stroke="white" strokeWidth="1.2" opacity="0.4" strokeLinecap="round" />
            <path d="M12 21L15 24" stroke="white" strokeWidth="1.2" opacity="0.4" strokeLinecap="round" />
            <path d="M24 21L21 24" stroke="white" strokeWidth="1.2" opacity="0.4" strokeLinecap="round" />
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2563EB" />
                <stop offset="1" stopColor="#1E40AF" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <span
          style={{ fontSize: s.text, letterSpacing: '-0.02em' }}
          className={`font-extrabold ${textColor}`}
        >
          Campus<span className="text-blue-400">Flow</span>
        </span>
      </div>
      {showTagline && (
        <span
          style={{ fontSize: s.tagline, paddingLeft: s.icon + 10 }}
          className={`font-medium ${taglineColor}`}
        >
          Your Campus. Your Resources. One Flow.
        </span>
      )}
    </div>
  );
}
