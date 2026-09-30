import './globals.css';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata = {
  title: 'Zyra — GTIS Enterprise Cybersecurity AI Chatbot',
  description: 'Intelligent AI cybersecurity assistant for threat intelligence, zero-trust architecture, compliance mapping, and enterprise vulnerability analysis.',
  keywords: 'GTIS AI, Zyra, cybersecurity chatbot, AI security assistant, threat intelligence, zero trust, SOC assistant',
  authors: [{ name: 'GTIS Cybersecurity' }],
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'Zyra — GTIS Enterprise Cybersecurity AI Chatbot',
    description: 'Intelligent AI cybersecurity assistant for threat intelligence, zero-trust architecture, compliance mapping, and enterprise vulnerability analysis.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
