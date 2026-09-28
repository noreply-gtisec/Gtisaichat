import './globals.css';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata = {
  title: 'GTIS — Enterprise AI Cybersecurity & Threat Defense Engine',
  description: 'Precision AI cybersecurity and managed threat intelligence platform. Autonomous SOC monitoring, zero-trust vulnerability defense, cloud hardening, and continuous compliance.',
  keywords: 'cybersecurity, GTIS AI, threat detection, zero trust, SOC monitoring, managed security, cloud hardening, compliance automation',
  authors: [{ name: 'GTIS Cybersecurity' }],
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'GTIS — Enterprise AI Cybersecurity & Threat Defense Engine',
    description: 'Precision AI cybersecurity and managed threat intelligence platform typesetting threat math like a technical manual.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
