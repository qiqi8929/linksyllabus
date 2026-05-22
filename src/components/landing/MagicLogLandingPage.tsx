import Link from "next/link";
import { magiclog_subscription } from "@/lib/magiclog/constants";

const TRIAL_HREF = "/magiclog/onboarding";

const HOW_STEPS = [
  {
    heading: "🎤 Say it or 📷 Snap it",
    body: "Tell us what you worked on today — in one sentence or one photo"
  },
  {
    heading: "✍️ Mentor signs",
    body: "Your mentor signs on screen or via SMS link. No app needed."
  },
  {
    heading: "📤 Submit to AIT",
    body: "Export your period package and submit to MyTradesecrets in minutes."
  }
] as const;

const FEATURES = [
  "Voice & photo logging",
  "AI-generated work orders",
  "AIT-format export (Alberta)",
  "Mentor signature (in person or SMS)",
  "Progress tracking",
  "Coming soon: BC, Ontario"
] as const;

export function MagicLogLandingPage() {
  return (
    <div id="ml-landing">
      <header className="ml-landing-nav">
        <div className="ml-landing-nav-inner">
          <Link href="/" className="ml-landing-logo">
            Magic <em>Log</em>
          </Link>
          <nav className="ml-landing-nav-links" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link href={`/login?next=${TRIAL_HREF}`}>Log in</Link>
            <Link href={TRIAL_HREF} className="ml-landing-btn-primary">
              Start free trial
            </Link>
          </nav>
        </div>
      </header>

      <section className="ml-landing-hero">
        <h1>Log your apprenticeship hours in seconds</h1>
        <p className="ml-landing-hero-tagline">Speak it. Snap it. Done.</p>
        <div className="ml-landing-hero-cta">
          <Link href={TRIAL_HREF} className="ml-landing-btn-primary ml-landing-btn-lg">
            Start free trial
          </Link>
          <a href="#how" className="ml-landing-link-secondary">
            See how it works ↓
          </a>
        </div>
      </section>

      <section id="how" className="ml-landing-section">
        <h2 className="ml-landing-section-title">How it works</h2>
        <div className="ml-landing-steps">
          {HOW_STEPS.map((step, i) => (
            <article key={step.heading} className="ml-landing-step">
              <span className="ml-landing-step-index">{i + 1}</span>
              <h3>{step.heading}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="ml-landing-section ml-landing-section--alt">
        <h2 className="ml-landing-section-title">Features</h2>
        <ul className="ml-landing-feature-list">
          {FEATURES.map((item) => (
            <li key={item}>
              <span className="ml-landing-feature-check" aria-hidden>
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section id="pricing" className="ml-landing-section">
        <h2 className="ml-landing-section-title">Pricing</h2>
        <div className="ml-landing-pricing">
          <p className="ml-landing-pricing-trial">
            {magiclog_subscription.trialDays}-day free trial
          </p>
          <p className="ml-landing-pricing-price">
            Then ${magiclog_subscription.monthlyUsd}
            <span>/month</span>
          </p>
          <p className="ml-landing-pricing-note">Cancel anytime</p>
          <Link href={TRIAL_HREF} className="ml-landing-btn-primary ml-landing-btn-lg">
            Start free trial
          </Link>
        </div>
      </section>

      <footer className="ml-landing-footer">
        <Link href={TRIAL_HREF} className="ml-landing-btn-primary ml-landing-btn-lg">
          Start free trial
        </Link>
        <p className="ml-landing-footer-meta">
          © {new Date().getFullYear()} LinkSyllabus ·{" "}
          <Link href="/privacy">Privacy</Link>
        </p>
      </footer>
    </div>
  );
}
