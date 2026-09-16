"use client";

import { useEffect, useId, useRef, useState } from "react";

/** A button that opens a floating glass panel. Closes on outside click, Escape, or when an item calls close(). */
export function Dropdown({
  label,
  buttonClass,
  panelClass = "",
  align = "start",
  children,
}: {
  label: React.ReactNode;
  buttonClass: string;
  panelClass?: string;
  align?: "start" | "end";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={root}>
      <button ref={button} type="button" className={buttonClass} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div id={panelId} className={`dropdown-panel align-${align} ${panelClass}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
