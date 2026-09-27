import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kitty · savings circles without borders',
  description:
    'Ajo, susu, chama across Lagos, Nairobi, Kampala and Accra: each member pays on their own local rail, and a netting ledger keeps money from crossing borders.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f5f2ea' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
