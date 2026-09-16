const PATHS = {
  brief: "M4 5h16M4 12h10M4 19h7M17 15l2 2 3-4",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  agents: "M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM5 14a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM19 14a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM12 9v3m0 0-5 3m5-3 5 3",
  settings: "M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4",
  plus: "M12 5v14M5 12h14",
  signout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
} as const;

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={PATHS[name]} />
      </svg>
    </span>
  );
}
