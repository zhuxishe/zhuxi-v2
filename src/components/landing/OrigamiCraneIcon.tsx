export function OrigamiCraneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 140" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="cranePaper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffdf8" />
          <stop offset="100%" stopColor="#d6e5ca" />
        </linearGradient>
        <linearGradient id="craneShadowFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eef4e8" />
          <stop offset="100%" stopColor="#9cb88d" />
        </linearGradient>
        <filter id="craneShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="9" stdDeviation="10" floodColor="#10251f" floodOpacity="0.16" />
        </filter>
      </defs>

      <g filter="url(#craneShadow)" stroke="#14372d" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        <path
          d="M92 72 L26 38 L76 93 Z"
          fill="url(#craneShadowFill)"
          className="origin-[92px_72px] transition-transform duration-500 group-hover:-rotate-6"
        />
        <path
          d="M90 71 L156 24 L109 96 Z"
          fill="url(#cranePaper)"
          className="origin-[90px_71px] transition-transform duration-500 group-hover:rotate-6"
        />
        <path d="M76 93 L92 72 L109 96 L90 116 Z" fill="#f6f1e6" />
        <path d="M92 72 L111 55 L109 96 Z" fill="#c6d9ba" />
        <path d="M92 72 L71 54 L76 93 Z" fill="#f0f5ea" />
        <path d="M90 116 L134 126 L106 100 Z" fill="#e2ecda" />
        <path d="M73 53 L92 72 L85 25 Z" fill="#fffdf7" />
        <path d="M85 25 L112 13 L97 54 Z" fill="#d1e2c8" />
        <path d="M112 13 L132 8 L118 24 Z" fill="#14372d" />
        <path d="M97 54 L119 36" fill="none" />
        <path d="M92 72 L57 118" fill="none" />
        <path d="M101 74 L82 128" fill="none" />
        <path d="M91 72 L59 91" fill="none" opacity="0.45" />
        <path d="M91 72 L123 83" fill="none" opacity="0.45" />
      </g>
    </svg>
  )
}
