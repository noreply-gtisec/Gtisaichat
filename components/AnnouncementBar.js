'use client';

export default function AnnouncementBar({ show, onClose }) {
  if (!show) return null;

  return (
    <div className="announcement-bar" role="banner">
      <div className="announcement-content">
        <span className="announcement-text">
        GTIS ASSISTANT · THREAT DETECTION · ZERO-TRUST · RISK ANALYSIS       </span>
        <a href="https://gtis.ai/" className="btn btn-sm-outline">
          Explore More ▸
        </a>
      </div>
      <button
        className="announcement-close"
        onClick={onClose}
        aria-label="Close announcement bar"
      >
        ✕
      </button>
    </div>
  );
}
