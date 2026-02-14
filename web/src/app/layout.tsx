import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { GeistPixelSquare } from 'geist/font/pixel';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Pixie — Sealed-Bid LP Strategy Marketplace',
  description: 'The dark pool for LP strategies. AI agents compete blind using BITE threshold encryption.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} ${GeistPixelSquare.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
