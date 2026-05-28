import '@/frontend/styles/globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/frontend/components/auth-provider';
import { Header } from '@/frontend/components/layout/header';
import { Footer } from '@/frontend/components/layout/footer';

export const metadata: Metadata = {
  title: 'VINTRACK',
  description: 'Trust-centric collectible asset transaction platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AuthProvider>
          <Header />
          <main style={{ flex: 1 }}>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
