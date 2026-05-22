import { z } from 'zod';

/**
 * Placeholder for marketplace listing contracts.
 *
 * To be implemented when marketplace domain is scaffolded.
 * Must export: schema, inferred type, and example.
 */

export const ListingResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  price: z.number().positive(),
  currency: z.string().length(3),
  sellerId: z.string().uuid(),
  status: z.enum(['draft', 'active', 'sold', 'withdrawn']),
  createdAt: z.string().datetime(),
});

export type ListingResponse = z.infer<typeof ListingResponseSchema>;

export const ListingResponseExample: ListingResponse = {
  id: '550e8400-e29b-41d4-a716-446655440003',
  title: 'Vintage Rolex Submariner 16610',
  description: 'Original box and papers, serviced 2023.',
  price: 12500.0,
  currency: 'USD',
  sellerId: '550e8400-e29b-41d4-a716-446655440002',
  status: 'active',
  createdAt: '2024-06-01T09:00:00Z',
};
