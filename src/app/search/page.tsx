import { SearchPageClient } from '@/frontend/components/search/search-page-client';

/**
 * Search Results Page (Server Component)
 *
 * Reads Algolia configuration from environment variables
 * and passes them to the client-side InstantSearch wrapper.
 *
 * Ticket: T3.5
 */
export default function SearchPage() {
  const appId = process.env.ALGOLIA_APP_ID ?? '';
  const apiKey = process.env.ALGOLIA_API_KEY ?? '';
  const indexName = process.env.ALGOLIA_INDEX_NAME ?? 'listings';

  return (
    <div className="min-h-[calc(100vh-200px)]">
      <SearchPageClient
        appId={appId}
        apiKey={apiKey}
        indexName={indexName}
      />
    </div>
  );
}
