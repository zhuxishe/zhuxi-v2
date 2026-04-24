export function OrigamiCraneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="craneWing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2c5f49" />
          <stop offset="100%" stopColor="#dce7cf" />
        </linearGradient>
        <linearGradient id="cranePaper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffdfa" />
          <stop offset="100%" stopColor="#e6eddc" />
        </linearGradient>
        <filter id="craneShadow" x="-25%" y="-25%" width="170%" height="180%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#10251f" floodOpacity="0.13" />
        </filter>
      </defs>

      <g
        filter="url(#craneShadow)"
        stroke="#173a2f"
        strokeWidth="1.9"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path
          d="M48 66 C44 52 48 39 60 29 C66 23 70 18 70 13"
          fill="none"
          className="transition-transform duration-500 group-hover:-translate-y-0.5"
        />
        <path
          d="M60 29 L50 25 L55 38 Z"
          fill="url(#cranePaper)"
        />
        <path
          d="M48 66 L31 76 L57 78 Z"
          fill="url(#cranePaper)"
          className="origin-[48px_66px] transition-transform duration-500 group-hover:-rotate-[3deg]"
        />
        <path
          d="M50 66 L104 34 L72 85 Z"
          fill="url(#craneWing)"
          className="origin-[50px_66px] transition-transform duration-500 group-hover:rotate-[4deg] group-hover:-translate-y-0.5"
        />
        <path
          d="M46 68 L72 85 L56 96 Z"
          fill="#f8f3e8"
        />
        <path
          d="M56 96 L85 99 L70 87 Z"
          fill="#dfeada"
        />
        <path
          d="M46 68 L56 96 L37 86 Z"
          fill="#eef4e7"
        />
        <path d="M50 66 L72 85" fill="none" opacity="0.45" />
        <path d="M57 78 L38 88" fill="none" opacity="0.42" />
        <path d="M72 85 L92 48" fill="none" opacity="0.36" />
        <path d="M28 95 C48 108 81 108 104 88" fill="none" opacity="0.34" />
        <path d="M24 100 C49 116 88 114 111 93" fill="none" opacity="0.22" />
      </g>
    </svg>
  )
}
