type BrandLogoProps = {
  compact?: boolean
}

function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-11 w-11 shrink-0"
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="6" y="6" width="60" height="60" rx="18" fill="#111827" />
      <path
        d="M24 26L16 36L24 46"
        stroke="#F3F4F6"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M48 26L56 36L48 46"
        stroke="#F3F4F6"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M35 20L29 52"
        stroke="#6EE7B7"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="18" cy="18" r="4" fill="#F59E0B" />
      <circle cx="54" cy="18" r="4" fill="#38BDF8" />
      <circle cx="36" cy="54" r="4" fill="#6EE7B7" />
    </svg>
  )
}

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="min-w-0">
        <p className="text-[0.68rem] font-semibold tracking-[0.38em] text-slate-400 uppercase">
          Agent
        </p>
        <p
          className={`font-semibold tracking-[0.08em] text-slate-50 ${
            compact ? "text-lg" : "text-xl"
          }`}
        >
          Swarm
        </p>
      </div>
    </div>
  )
}
