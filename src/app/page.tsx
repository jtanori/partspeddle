import { Suspense } from 'react';
import { ListingGrid } from '@/frontend/components/marketplace/listing-grid';

export default function HomePage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Featured Listings</h1>
      <Suspense
        fallback={
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            Loading listings…
          </div>
        }
      >
        <ListingGrid />
      </Suspense>
    </div>
  );
}
