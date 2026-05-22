import type { ListingResponse } from '@/shared/contracts/marketplace/listing-schema';

interface ListingCardProps {
  listing: ListingResponse;
}

export function ListingCard({ listing }: ListingCardProps) {
  return (
    <article
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '1rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem' }}>{listing.title}</h3>
      <p style={{ margin: '0 0 0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
        {listing.description.substring(0, 120)}
        {listing.description.length > 120 ? '…' : ''}
      </p>
      <p style={{ margin: 0, fontWeight: 600 }}>
        {new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: listing.currency,
        }).format(listing.price)}
      </p>
    </article>
  );
}
