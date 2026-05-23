import Link from "next/link";
import { magiclog_subscription } from "@/lib/magiclog/constants";
import { MagicLogDashboardPreview } from "@/components/landing/MagicLogDashboardPreview";
import { MagicLogLandingFaq } from "@/components/landing/MagicLogLandingFaq";

const TRIAL_HREF = "/signup?next=/magiclog/onboarding";
const CONTACT_EMAIL = "info@linksyllabus.com";

const FEATURE_BAR = [
  "Alberta AIT",
  "Voice logging",
  "Photo logging",
  "Mentor signature",
  "AIT-format export",
  "Any trade"
] as const;

function IconMic() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6 11a6 6 0 0 0 12 0M12 17v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPen() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l9.5-9.5a2.12 2.12 0 0 0-3-3L5 17v3z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l3 3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 4h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M16 4v4h4M10 13h6M10 17h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const HOW_CARDS = [
  {
    icon: <IconMic />,
    title: "Say it or snap it",
    body: "One sentence or one photo — AI does the rest"
  },
  {
    icon: <IconPen />,
    title: "Mentor signs",
    body: "On screen or via SMS link. No app needed."
  },
  {
    icon: <IconDoc />,
    title: "Submit to AIT",
    body: "Export your 2-page period package and upload to MyTradesecrets."
  }
] as const;

export function MagicLogLandingPage() {
  return (
    <div id="ml-landing">
      <header className="ml-nav">
        <div className="ml-container ml-nav-inner">
          <Link href="/" className="ml-logo">
            Magic Log<span className="ml-logo-dot" aria-hidden />
          </Link>
          <a href={TRIAL_HREF} className="ml-btn-nav">
            Try for free
          </a>
        </div>
      </header>

      <section className="ml-hero">
        <div className="ml-container ml-hero-grid">
          <div className="ml-hero-copy">
            <p className="ml-label">For Canadian trades apprentices</p>
            <h1>Never fill out your blue book again.</h1>
            <p className="ml-hero-sub">
              Say it. Snap it. Magic Log does the rest.
            </p>
            <a href={TRIAL_HREF} className="ml-btn-cta">
              Start free trial →
            </a>
            <p className="ml-hero-fine">
              {magiclog_subscription.trialDays}-day free trial · No credit card required
            </p>
          </div>
          <div className="ml-hero-visual">
            <MagicLogDashboardPreview />
          </div>
        </div>
      </section>

      <section className="ml-feature-bar" aria-label="Features">
        <div className="ml-container">
          <p className="ml-feature-bar-text">
            {FEATURE_BAR.map((item, i) => (
              <span key={item}>
                {i > 0 ? <span className="ml-feature-sep">⊙</span> : null}
                {item}
              </span>
            ))}
          </p>
        </div>
      </section>

      <section id="how" className="ml-section">
        <div className="ml-container">
          <p className="ml-section-label">How it works</p>
          <h2 className="ml-section-headline">Magic Log keeps it simple.</h2>
          <div className="ml-how-grid">
            {HOW_CARDS.map((card) => (
              <article key={card.title} className="ml-how-card">
                <div className="ml-how-icon">{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ml-section">
        <div className="ml-container">
          <blockquote className="ml-testimonial">
            <p className="ml-testimonial-quote">
              &ldquo;Finally a digital blue book that actually works.&rdquo;
            </p>
            <footer>— Electrician apprentice, Alberta</footer>
          </blockquote>
        </div>
      </section>

      <section className="ml-section">
        <div className="ml-container ml-faq-wrap">
          <h2 className="ml-faq-title">
            <span className="ml-faq-title-muted">Frequently</span> Asked{" "}
            <span className="ml-faq-title-bold">Questions</span>
          </h2>
          <MagicLogLandingFaq />
        </div>
      </section>

      <section className="ml-section">
        <div className="ml-container ml-platform-grid">
          <article className="ml-platform-card">
            <div className="ml-platform-badge" aria-hidden>
              <span className="ml-logo-dot" />
            </div>
            <h3>For web</h3>
            <p>Use Magic Log on any browser, right now.</p>
            <a href={TRIAL_HREF} className="ml-btn-platform">
              Start free trial
            </a>
          </article>
          <article className="ml-platform-card ml-platform-card--muted">
            <div className="ml-platform-badge" aria-hidden>
              <span className="ml-logo-dot" />
            </div>
            <h3>For mobile</h3>
            <p>iOS and Android — coming soon.</p>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Magic Log mobile waitlist")}`}
              className="ml-btn-platform ml-btn-platform--ghost"
            >
              Join waitlist
            </a>
          </article>
        </div>
      </section>

      <footer className="ml-footer">
        <div className="ml-container">
          <p>
            © 2026 Magic Log · Built by LinkSyllabus
          </p>
          <p className="ml-footer-links">
            <Link href="/privacy">Privacy</Link>
            <span aria-hidden> · </span>
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
            <span aria-hidden> · </span>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
