/** Static dashboard preview for marketing hero (mirrors /magiclog/dashboard UI). */
export function MagicLogDashboardPreview() {
  return (
    <div className="ml-hero-preview" aria-hidden>
      <div className="ml-hero-preview-chrome">
        <span className="ml-hero-preview-dot" />
        <span className="ml-hero-preview-dot" />
        <span className="ml-hero-preview-dot" />
        <span className="ml-hero-preview-url">linksyllabus.com/magiclog/dashboard</span>
      </div>
      <div className="ml-hero-preview-body">
        <aside className="ml-hero-preview-sidebar">
          <span className="ml-hero-preview-nav-active" />
          <span />
          <span />
        </aside>
        <div className="ml-hero-preview-main">
          <p className="ml-hero-preview-greeting">Hi Alex 👋</p>
          <p className="ml-hero-preview-meta">Electrician · Period 1 · Alberta</p>
          <h2 className="ml-hero-preview-title">What did you work on today?</h2>
          <p className="ml-hero-preview-sub">Log your hours — speak, snap, or type</p>
          <div className="ml-hero-preview-grid">
            <div className="ml-hero-preview-card ml-hero-preview-card--primary">
              <strong>Record voice</strong>
              <span>Say it in one sentence</span>
            </div>
            <div className="ml-hero-preview-card">
              <strong>Take photo</strong>
              <span>Snap your work</span>
            </div>
            <div className="ml-hero-preview-card">
              <strong>Type it</strong>
              <span>Enter task manually</span>
            </div>
            <div className="ml-hero-preview-card">
              <strong>Learn with steps</strong>
              <span>Video + QR guide</span>
            </div>
          </div>
          <div className="ml-hero-preview-progress">
            <div className="ml-hero-preview-progress-head">
              <span>Period 1 progress</span>
              <span>420 / 1,500 hrs</span>
            </div>
            <div className="ml-hero-preview-bar">
              <div className="ml-hero-preview-bar-fill" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
