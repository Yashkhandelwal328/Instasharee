import Script from 'next/script';

export const metadata = {
  title: 'instashare.io — P2P File Transfer',
  description: 'Transfer files instantly, peer-to-peer. No account needed. Share a 6-digit key.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        {children}
        <Script src="/qrcode.min.js" strategy="beforeInteractive" />
        <Script src="/app.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
