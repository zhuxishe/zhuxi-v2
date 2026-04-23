"use client"

export function OrigamiCraneIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 130"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="cranePaper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffdf7" />
          <stop offset="100%" stopColor="#dfe9d6" />
        </linearGradient>
        <linearGradient id="craneWing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8f3e7" />
          <stop offset="100%" stopColor="#9fbd8f" />
        </linearGradient>
        <filter id="craneShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#10251f" floodOpacity="0.18" />
        </filter>
      </defs>

      <g filter="url(#craneShadow)" stroke="#14372d" strokeWidth="2" strokeLinejoin="round">
        <path
          d="M78 66 L18 36 L64 92 Z"
          fill="url(#craneWing)"
          className="origin-[78px_66px] transition-transform duration-500 group-hover:-rotate-6"
        />
        <path
          d="M82 66 L142 28 L101 95 Z"
          fill="#f5efe2"
          className="origin-[82px_66px] transition-transform duration-500 group-hover:rotate-6"
        />
        <path d="M64 92 L82 66 L101 95 L81 112 Z" fill="url(#cranePaper)" />
        <path d="M82 66 L106 51 L101 95 Z" fill="#c9dcc0" />
        <path d="M82 66 L58 52 L64 92 Z" fill="#edf3e6" />
        <path d="M101 95 L130 116 L84 111 Z" fill="#e8f0df" />
        <path d="M58 52 L82 66 L72 29 Z" fill="#fffdf7" />
        <path d="M72 29 L100 15 L82 66 Z" fill="#d7e6cf" />
        <path d="M100 15 L121 9 L108 25 Z" fill="#14372d" />
        <path d="M76 71 L43 108" fill="none" strokeLinecap="round" />
        <path d="M87 73 L58 121" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}
