import Link from "next/link";
import { AGENTS, AGENT_IDS } from "@/agents/registry";
import { RadarSweep } from "@/components/landing/RadarSweep";
import "./landing.css";

const CONSOLE = [
  { agent: "growth_gps", state: "done", text: "score 64 · 3 priorities · 5 tasks" },
  { agent: "paralegal", state: "done", text: "12 checks · 3 high risk" },
  { agent: "trend_hawk", state: "busy", text: "searching the web · 14 sources" },
  { agent: "competitor_radar", state: "busy", text: "mapping 6 competitors" },
  { agent: "operational_radar", state: "done", text: "score 58 · 4 automations" },
] as const;

const BRIEF_SCORES = [
  { agent: "growth_gps", value: 64 },
  { agent: "paralegal", value: 41 },
  { agent: "trend_hawk", value: 72 },
  { agent: "competitor_radar", value: 55 },
  { agent: "operational_radar", value: 58 },
] as const;

const BRIEF_TASKS = [
  { agent: "paralegal", priority: "high", due: "3 days", title: "Register for VAT before wholesale invoices pass the threshold" },
  { agent: "growth_gps", priority: "high", due: "7 days", title: "Pitch a 4-week trial supply to the 10 busiest cafés in Bole" },
  { agent: "competitor_radar", priority: "medium", due: "14 days", title: "Publish origin and roast-date on every bag, the one thing rivals skip" },
] as const;

const FAQ = [
  {
    q: "What does a run actually cost me?",
    a: "Nothing during early access. Each agent run uses Claude, Anthropic's AI model, and the two research agents also search the web. When paid plans arrive we'll tell you the limits before anything changes.",
  },
  {
    q: "Is My Paralegal legal advice?",
    a: "No. It builds the checklist a business like yours usually needs where you operate, marks what looks missing, and turns the risky or unclear items into questions for a qualified local lawyer.",
  },
  {
    q: "Where does the research come from?",
    a: "Trend Hawk and Competitor Radar search the live web every time they run and cite their sources, so you can check every claim. The other three work from your company profile.",
  },
  {
    q: "What happens to my company information?",
    a: "Your profile is stored in your account and sent to Claude only to write your reports. It isn't sold or shared, and deleting your account deletes it.",
  },
  {
    q: "How often should I run the agents?",
    a: "Whenever something changes: a new goal, a new competitor, before a board or investor update. Many owners run the research agents weekly and the others monthly.",
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="l-nav">
        <div className="wrap l-nav-bar">
          <Link href="/" className="wordmark" aria-label="Budera home">
            <span className="wordmark-mark" aria-hidden="true" />
            Budera
          </Link>
          <nav aria-label="Main" className="l-links">
            <a href="#agents">Agents</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="l-nav-cta">
            <Link href="/login" className="l-signin">Sign in</Link>
            <Link href="/signup" className="btn btn-primary btn-sm">Start free</Link>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow on-ink">AI business partner for founders</p>
            <h1>
              Your company,
              <br />
              briefed every morning.
            </h1>
            <p className="hero-lede">
              Five AI specialists study your business, your market and your competitors. Then they hand you a short brief and the few
              tasks worth doing this week.
            </p>
            <div className="hero-actions">
              <Link href="/signup" className="btn btn-primary">Start free</Link>
              <a href="#brief" className="btn btn-on-ink">See a sample brief</a>
            </div>
            <p className="hero-note">Free during early access. Set up in about five minutes.</p>
          </div>

          <div className="console-stage">
            <RadarSweep />
            <figure className="console" aria-label="Example agent run">
              <div className="console-bar">
                <span className="dots" aria-hidden="true"><i /><i /><i /></span>
                <span className="mono">kaffa-roasters · run all</span>
                <span className="console-tag mono">Example</span>
              </div>
              <ol className="console-lines">
                {CONSOLE.map((line) => (
                  <li key={line.agent} className={line.state}>
                    <span className="c-state" aria-label={line.state === "done" ? "Finished" : "Working"} />
                    <span className="c-agent">{AGENTS[line.agent].name}</span>
                    <span className="c-text mono">{line.text}</span>
                  </li>
                ))}
              </ol>
              <figcaption className="console-foot mono">
                <span>2 of 5 still researching</span>
                <span className="cursor" aria-hidden="true" />
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="section" id="brief">
        <div className="wrap brief-grid">
          <div className="section-copy">
            <p className="eyebrow">What you get</p>
            <h2>One run. One page. A clear next week.</h2>
            <p>
              Every agent scores one part of your business and explains the number. Their tasks land in a single list, ranked by
              urgency, so you never have to read five reports to know what to do on Monday.
            </p>
            <ul className="ticks">
              <li>Scores you can track run over run</li>
              <li>Tasks sized for a small team, with due dates</li>
              <li>Sources linked for every market claim</li>
            </ul>
          </div>

          <article className="brief" aria-label="Example brief for a fictional company">
            <header className="brief-head">
              <div>
                <p className="eyebrow">Brief · Kaffa Roasters</p>
                <h3>Specialty coffee · Addis Ababa</h3>
              </div>
              <span className="brief-stamp mono">16 Sep 2026</span>
            </header>

            <div className="brief-scores">
              {BRIEF_SCORES.map((s) => (
                <div key={s.agent} className="bscore">
                  <span className="bscore-name">{AGENTS[s.agent].scoreLabel}</span>
                  <span className="bscore-bar" aria-hidden="true"><i style={{ width: `${s.value}%` }} /></span>
                  <span className="bscore-val mono">{s.value}</span>
                </div>
              ))}
            </div>

            <div className="brief-tasks">
              <p className="eyebrow">This week</p>
              <ol>
                {BRIEF_TASKS.map((t) => (
                  <li key={t.title}>
                    <span className={`prio prio-${t.priority}`}>{t.priority}</span>
                    <span className="bt-title">{t.title}</span>
                    <span className="bt-meta mono">{AGENTS[t.agent].name} · due in {t.due}</span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="brief-caption">Example brief for a fictional company.</p>
          </article>
        </div>
      </section>

      <section className="section section-ink" id="agents">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow on-ink">The legion</p>
            <h2>Five specialists. One company: yours.</h2>
          </div>
          <ul className="roster">
            {AGENT_IDS.map((id) => {
              const a = AGENTS[id];
              return (
                <li key={id} className="roster-row">
                  <div className="roster-name">
                    <span className="eyebrow on-ink">{a.role}</span>
                    <h3>{a.name}</h3>
                    {a.usesWeb && <span className="web-badge mono">Searches the web</span>}
                  </div>
                  <div className="roster-col">
                    <span className="roster-label mono">Watches</span>
                    <p>{a.watches}</p>
                  </div>
                  <div className="roster-col">
                    <span className="roster-label mono">Returns</span>
                    <p>{a.returns}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="section" id="how">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>From sign-up to your first brief in minutes.</h2>
          </div>
          <ol className="steps">
            <li>
              <span className="step-n mono">01</span>
              <h3>Describe your company</h3>
              <p>Answer five short screens: what you sell, who buys it, where you operate, who you compete with and what you want next.</p>
            </li>
            <li>
              <span className="step-n mono">02</span>
              <h3>Run the agents</h3>
              <p>Run all five at once or one at a time. The research agents search the web while the others work from your profile.</p>
            </li>
            <li>
              <span className="step-n mono">03</span>
              <h3>Work the list</h3>
              <p>Read the scores, tick off tasks as you go, and run an agent again whenever your plans or your market change.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-soft" id="pricing">
        <div className="wrap pricing">
          <div className="section-copy">
            <p className="eyebrow">Pricing</p>
            <h2>Free while we're in early access.</h2>
            <p>
              We're building Budera with its first owners. Use every agent at no cost, tell us what's missing, and keep your data when
              paid plans launch.
            </p>
          </div>
          <div className="plan">
            <p className="eyebrow">Early access</p>
            <p className="plan-price">
              <span>$0</span> / month
            </p>
            <ul className="ticks">
              <li>All five agents</li>
              <li>Live web research with sources</li>
              <li>Unified task list and score history</li>
              <li>One company profile</li>
            </ul>
            <Link href="/signup" className="btn btn-primary">Claim early access</Link>
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="wrap faq">
          <div className="section-head">
            <p className="eyebrow">Questions</p>
            <h2>Before you start.</h2>
          </div>
          <div className="faq-list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="final">
        <div className="wrap final-inner">
          <h2>Get tomorrow morning's brief.</h2>
          <Link href="/signup" className="btn btn-primary">Start free</Link>
        </div>
      </section>

      <footer className="l-foot">
        <div className="wrap l-foot-inner">
          <span className="wordmark small">
            <span className="wordmark-mark" aria-hidden="true" />
            Budera
          </span>
          <span>AI reports can be wrong. Check sources and consult professionals for legal and financial decisions.</span>
          <span>© {new Date().getFullYear()} Budera</span>
        </div>
      </footer>
    </div>
  );
}
