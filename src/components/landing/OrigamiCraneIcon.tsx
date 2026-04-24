export function OrigamiCraneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="craneWing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#173a2f" />
          <stop offset="52%" stopColor="#2f624c" />
          <stop offset="100%" stopColor="#cbdabf" />
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
          d="M54 66 C44 48 48 31 66 20 C73 16 81 13 90 10"
          fill="none"
          className="transition-transform duration-500 group-hover:-translate-y-0.5"
        />
        <path
          d="M67 20 L44 25 L59 33 Z"
          fill="url(#cranePaper)"
        />
        <path
          d="M54 66 L18 79 L60 83 Z"
          fill="url(#cranePaper)"
          className="origin-[54px_66px] transition-transform duration-500 group-hover:-rotate-[3deg]"
        />
        <path
          d="M58 66 L139 31 L91 88 Z"
          fill="url(#craneWing)"
          className="origin-[58px_66px] transition-transform duration-500 group-hover:rotate-[4deg] group-hover:-translate-y-0.5"
        />
        <path
          d="M53 68 L91 88 L64 98 Z"
          fill="#f8f3e8"
        />
        <path
          d="M64 98 L111 101 L88 88 Z"
          fill="#dfeada"
        />
        <path
          d="M53 68 L64 98 L31 88 Z"
          fill="#eef4e7"
        />
        <path d="M58 66 L91 88" fill="none" opacity="0.45" />
        <path d="M60 83 L34 91" fill="none" opacity="0.42" />
        <path d="M91 88 L125 44" fill="none" opacity="0.36" />
        <path d="M24 98 C52 112 105 109 139 82" fill="none" strokeWidth="2.4" opacity="0.42" />
        <path d="M19 105 C54 123 116 118 150 90" fill="none" strokeWidth="1.5" opacity="0.28" />
      </g>
    </svg>
  )
}
