import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Kitty',
  description: 'Savings circles across Lagos, Nairobi, Kampala and Accra, each member on their own local rail.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0f1115', color: '#e8e8ea' }}>
        {children}
      </body>
    </html>
  );
}
