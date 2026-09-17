"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Signs out of the throwaway demo account and opens sign-up. */
export function LeaveDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
        router.push("/signup");
        router.refresh();
      }}
    >
      {busy ? "One moment…" : "Create my free account"}
    </button>
  );
}
