import type { MemberLevel } from "@/lib/profile/types"

// Bamboo shoot, bamboo and panda motifs from the player handbook.
export function MemberLevelIcon({ level, className }: { level: MemberLevel; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" className={className} aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="31" fill="#F1E8D8" />
      {level === 1 && (
        <g transform="rotate(24 32 33)" strokeLinecap="round" strokeLinejoin="round">
          <path d="M32 14c-5 9-16 18-17 27-1 8 6 13 17 13s18-5 17-13c-1-9-12-18-17-27Z" fill="#B38B6B" />
          <path d="M32 14c-3 12-2 27 0 40-11 0-18-5-17-13 1-9 12-18 17-27Z" fill="#9D775B" />
          <path d="M16 35c8 1 13 8 16 19-10-1-17-5-17-13 0-2 0-4 1-6Z" fill="#89684F" />
          <path d="M48 35c-8 1-13 8-16 19 11 0 18-5 17-13 0-2 0-4-1-6Z" fill="#A78060" />
          <path d="M22 27c5 1 8 4 10 8m10-8c-5 1-8 4-10 8M18 36c6-1 11 3 14 7m14-7c-6-1-11 3-14 7M20 46c4 0 8 2 12 5m12-5c-4 0-8 2-12 5" fill="none" stroke="#CEAA86" strokeWidth="1.5" />
          <path d="M31 16c-4-3-5-7-3-10 3 3 5 6 3 10Z" fill="#7B9558" />
          <path d="M32 16c-1-5 1-9 5-11 0 5-1 8-5 11Z" fill="#547744" />
        </g>
      )}
      {level === 2 && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="m25 51-7-33" fill="none" stroke="#8A9D61" strokeWidth="5" />
          <path d="M31 53V13" fill="none" stroke="#52764B" strokeWidth="6" />
          <path d="m36 51 9-29" fill="none" stroke="#6D8A50" strokeWidth="5" />
          <path d="m19 29 5-1m-3 12 5-1m2-15h6m-6 13h6m6-3 5 1m-8 9 5 1" fill="none" stroke="#E4E8C9" strokeWidth="1.5" />
          <path d="m31 25 11-13M22 37 11 28m25 17 15-8M19 25 11 16" fill="none" stroke="#52764B" strokeWidth="1.5" />
          <path d="M33 23c-6-1-11-5-12-11 6 2 10 5 12 11Zm3-5c-1-7 2-12 7-14 0 6-2 11-7 14Zm1 2c5-5 11-6 16-3-5 4-10 5-16 3Z" fill="#65844D" />
          <path d="M19 34c-7 1-12-1-15-6 7-1 12 1 15 6Zm-3-3c-4-5-5-10-3-15 4 4 6 9 3 15Zm24 11c3-7 7-11 13-11-1 6-5 10-13 11Zm1 1c7-2 12-1 16 3-6 3-12 1-16-3Z" fill="#789755" />
        </g>
      )}
      {level === 3 && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="32" cy="43" rx="15" ry="14" fill="#39463E" />
          <ellipse cx="32" cy="44" rx="10" ry="12" fill="#FFFCF4" />
          <path d="M20 32c-6 2-9 8-8 13 1 4 5 5 8 1l6-9Z" fill="#39463E" />
          <path d="M44 32c6 2 9 8 8 13-1 4-5 5-8 1l-6-9Z" fill="#39463E" />
          <ellipse cx="21" cy="52" rx="9" ry="6" transform="rotate(22 21 52)" fill="#39463E" />
          <ellipse cx="43" cy="52" rx="9" ry="6" transform="rotate(-22 43 52)" fill="#39463E" />
          <circle cx="20" cy="13" r="6" fill="#39463E" />
          <circle cx="44" cy="13" r="6" fill="#39463E" />
          <ellipse cx="32" cy="26" rx="16" ry="15" fill="#FFFCF4" />
          <ellipse cx="25" cy="25" rx="5" ry="6" transform="rotate(28 25 25)" fill="#39463E" />
          <ellipse cx="39" cy="25" rx="5" ry="6" transform="rotate(-28 39 25)" fill="#39463E" />
          <circle cx="26" cy="24" r="1.5" fill="#FFFCF4" />
          <circle cx="38" cy="24" r="1.5" fill="#FFFCF4" />
          <path d="M29 31q3-2 6 0-1 3-3 3t-3-3Z" fill="#39463E" />
          <path d="M29 36q3 2 6 0" fill="none" stroke="#39463E" strokeWidth="1.3" />
          <path d="m39 49 5-15" fill="none" stroke="#6D8A50" strokeWidth="2.5" />
          <path d="M42 41c-5-1-7-4-7-8 4 1 7 4 7 8Zm1-2c1-5 4-7 8-7-1 4-4 6-8 7Z" fill="#789755" />
        </g>
      )}
    </svg>
  )
}
