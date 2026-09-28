'use client';

export default function AnnouncementBar({ show, onClose }) {
  if (!show) return null;

  return (
    <div className="announcement-bar" role="banner">
      <div className="announcement-content">
        <span className="announcement-text">
          FREE 30-MINUTE CYBERSECURITY & THREAT AUDIT FOR NEW CLIENTS
        </span>
        <a href="#audit" className="btn btn-sm-outline">
          CLAIM AUDIT ▸
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
