import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Self-hosted at build time by next/font: no runtime call to Google, no npm dependency.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', axes: ['opsz'] });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Kitty · savings circles without borders',
  description:
    'Ajo, susu, chama across Lagos, Nairobi, Kampala and Accra: everyone pays and gets paid on their own mobile money or bank. Your money stays home.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f5efe3' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
