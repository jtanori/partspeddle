import { getListings } from '@/frontend/lib/api/marketplace';
import { ListingCard } from './listing-card';

export async function ListingGrid() {
  let listings;
  try {
    listings = await getListings();
  } catch {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontFamily: 'system-ui, sans-serif' }}>
        <p>Featured listings are currently unavailable.</p>
        <p style={{ fontSize: '0.875rem' }}>Please check back later.</p>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontFamily: 'system-ui, sans-serif' }}>
        <p>No listings available yet.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1.5rem',
      }}
    >
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
