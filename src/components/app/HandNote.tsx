/** A handwritten margin note with a doodled arrow. Decorative: the same information is always in the page itself. */
export function HandNote({ children, arrow = "down", className = "" }: { children: React.ReactNode; arrow?: "down" | "down-left" | "left" | "right"; className?: string }) {
  return (
    <span className={`hand-note arrow-${arrow} ${className}`} aria-hidden="true">
      <span className="hand-note-text">{children}</span>
      <svg className="hand-arrow" viewBox="0 0 60 44" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 5c14 1 30 8 38 28" />
        <path d="M35 27l9 8 4-12" />
      </svg>
    </span>
  );
}
