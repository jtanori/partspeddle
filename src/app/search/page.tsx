import { SearchPageClient } from '@/frontend/components/search/search-page-client';

/**
 * Search Results Page (Server Component)
 *
 * Reads Algolia configuration from environment variables
 * and passes them to the client-side InstantSearch wrapper.
 *
 * Guards against missing configuration to allow static prerender
 * in CI environments where Algolia credentials are not injected.
 *
 * Ticket: T3.5
 */
export default function SearchPage() {
  const appId = process.env.ALGOLIA_APP_ID ?? '';
  const apiKey = process.env.ALGOLIA_API_KEY ?? '';
  const indexName = process.env.ALGOLIA_INDEX_NAME ?? 'listings';

  const searchEnabled = appId.length > 0 && apiKey.length > 0;

  if (!searchEnabled) {
    return (
      <div className="min-h-[calc(100vh-200px)] container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-4">Search Listings</h1>
        <p className="text-muted-foreground">
          Search is temporarily unavailable. Please check back later.
        </p>
      </div>
    );
  }

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
