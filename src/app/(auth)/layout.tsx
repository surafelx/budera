import Link from "next/link";
import "../app.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link href="/" className="app-wordmark" aria-label="Budera home">
          <span className="app-mark" aria-hidden="true" />
          Budera
        </Link>
        <div className="auth-pitch">
          <p className="eyebrow on-ink">Early access</p>
          <p className="auth-quote">Five specialists. One short brief. The tasks worth doing this week.</p>
        </div>
        <ul className="auth-agents mono">
          <li>Growth GPS</li>
          <li>My Paralegal</li>
          <li>Trend Hawk</li>
          <li>Competitor Radar</li>
          <li>Operational Radar</li>
        </ul>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}
