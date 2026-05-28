/**
 * MSW API Mock Handlers
 *
 * Centralized mock definitions for all backend API endpoints.
 * Used by both component tests (Vitest + MSW) and E2E test setup.
 *
 * Ticket: T3.7
 */

import { http, HttpResponse } from 'msw';
import type { ListingHit } from '@/shared/contracts/search/index.js';

// ─── Mock Data ─────────────────────────────────────────────────────────────

export const mockListings: ListingHit[] = [
  {
    objectID: 'listing-1',
    id: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Vintage Rolex Submariner',
    description: '1967 reference 5513, original dial and hands',
    category: 'watches',
    condition: 'excellent',
    price: 12500,
    currency: 'USD',
    location: 'New York, NY',
    seller_id: 'seller-1',
    seller_name: 'Horology House',
    status: 'published',
    thumbnail_url: 'https://placehold.co/400x300?text=Rolex',
    images: ['https://placehold.co/400x300?text=Rolex'],
    tags: ['vintage', 'rolex', 'submariner'],
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  {
    objectID: 'listing-2',
    id: '550e8400-e29b-41d4-a716-446655440002',
    title: 'Patek Philippe Nautilus 5711',
    description: 'Blue dial, full set with box and papers',
    category: 'watches',
    condition: 'like_new',
    price: 85000,
    currency: 'USD',
    location: 'Geneva, Switzerland',
    seller_id: 'seller-2',
    seller_name: 'Swiss Watch Exchange',
    status: 'published',
    thumbnail_url: 'https://placehold.co/400x300?text=Patek',
    images: ['https://placehold.co/400x300?text=Patek'],
    tags: ['patek', 'nautilus', 'luxury'],
    created_at: '2026-02-01T14:30:00Z',
    updated_at: '2026-02-01T14:30:00Z',
  },
  {
    objectID: 'listing-3',
    id: '550e8400-e29b-41d4-a716-446655440003',
    title: '1965 Shelby Cobra 427',
    description: 'Original aluminum body, numbers matching',
    category: 'vintage_cars',
    condition: 'good',
    price: 2500000,
    currency: 'USD',
    location: 'Los Angeles, CA',
    seller_id: 'seller-3',
    seller_name: 'Classic Car Warehouse',
    status: 'published',
    thumbnail_url: 'https://placehold.co/400x300?text=Cobra',
    images: ['https://placehold.co/400x300?text=Cobra'],
    tags: ['shelby', 'cobra', 'classic'],
    created_at: '2026-03-10T09:00:00Z',
    updated_at: '2026-03-10T09:00:00Z',
  },
];

// ─── Handlers ──────────────────────────────────────────────────────────────

export const handlers = [
  /**
   * GET /api/listings — Homepage featured listings
   */
  http.get('*/api/listings', () => {
    return HttpResponse.json({
      listings: mockListings,
      total: mockListings.length,
    });
  }),

  /**
   * GET /api/search — Search results (fallback when Algolia unavailable)
   */
  http.get('*/api/search', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.toLowerCase() ?? '';

    const results = query
      ? mockListings.filter(
          (l) =>
            l.title.toLowerCase().includes(query) ||
            (l.description?.toLowerCase().includes(query) ?? false) ||
            (l.tags?.some((t) => t.toLowerCase().includes(query)) ?? false)
        )
      : mockListings;

    return HttpResponse.json(results);
  }),

  /**
   * GET /api/listings/:id — Single listing detail
   */
  http.get('*/api/listings/:id', ({ params }) => {
    const listing = mockListings.find((l) => l.id === params.id);
    if (!listing) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(listing);
  }),

  /**
   * POST /auth/callback — Auth callback (Supabase SSR)
   */
  http.post('*/auth/callback', () => {
    return HttpResponse.json({
      session: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
        },
      },
    });
  }),

  /**
   * POST /auth/signout — Sign out
   */
  http.post('*/auth/signout', () => {
    return HttpResponse.json({ success: true });
  }),

  /**
   * GET /api/user/me — Current user profile
   */
  http.get('*/api/user/me', () => {
    return HttpResponse.json({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      role: 'buyer',
    });
  }),
];
