/**
 * ---
 * @customize  The pot ticket particles fire out of. Swap the SVG body to
 *             rebrand; keep the viewBox square so ClimbStage's positioning
 *             math (particles originate from the pot's rim) stays correct.
 * ---
 */
export function PotIcon({ className }: { className?: string }) {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      aria-hidden="true"
      className={className}
    >
      <ellipse cx="36" cy="52" rx="24" ry="7" fill="currentColor" opacity="0.15" />
      <path
        d="M16 30h40l-4 26a6 6 0 0 1-6 5H26a6 6 0 0 1-6-5z"
        fill="currentColor"
      />
      <rect x="12" y="22" width="48" height="10" rx="5" fill="currentColor" opacity="0.85" />
      <rect x="30" y="10" width="12" height="16" rx="4" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
