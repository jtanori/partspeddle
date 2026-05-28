/**
 * PostgreSQL Listing Repository
 *
 * Implements IListingRepository with outbox integration.
 * Every save() persists the aggregate and its uncommitted events atomically.
 */

import type postgres from 'postgres';
import type { IListingRepository } from '../../domain/repositories/listing-repository.js';
import { Listing } from '../../domain/entities/listing.js';
import { Outbox } from '../../../../shared/outbox/outbox.js';
import { PostgresOutboxAdapter } from '../../../shared/outbox/postgres-adapter.js';

export class PostgresListingRepository implements IListingRepository {
  constructor(private readonly sql: ReturnType<typeof postgres>) {}

  async findById(id: string): Promise<Listing | null> {
    const rows = await this.sql`
      SELECT id, title, description, price, currency, seller_id, status, created_at
      FROM marketplace.listings
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as {
      id: string;
      title: string;
      description: string;
      price: number;
      currency: string;
      seller_id: string;
      status: string;
      created_at: string;
    };

    return Listing.rehydrate({
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      currency: row.currency,
      sellerId: row.seller_id,
      status: row.status as 'draft' | 'active' | 'sold' | 'withdrawn',
      createdAt: row.created_at,
    });
  }

  async findBySellerId(sellerId: string): Promise<Listing[]> {
    const rows = await this.sql`
      SELECT id, title, description, price, currency, seller_id, status, created_at
      FROM marketplace.listings
      WHERE seller_id = ${sellerId}
      ORDER BY created_at DESC
    `;

    return rows.map((row) =>
      Listing.rehydrate({
        id: row.id as string,
        title: row.title as string,
        description: row.description as string,
        price: row.price as number,
        currency: row.currency as string,
        sellerId: row.seller_id as string,
        status: row.status as 'draft' | 'active' | 'sold' | 'withdrawn',
        createdAt: row.created_at as string,
      })
    );
  }

  async save(listing: Listing): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO marketplace.listings (id, title, description, price, currency, seller_id, status, created_at)
        VALUES (
          ${listing.id},
          ${listing.title},
          ${listing.description},
          ${listing.price},
          ${listing.currency},
          ${listing.sellerId},
          ${listing.status},
          ${listing.createdAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          currency = EXCLUDED.currency,
          seller_id = EXCLUDED.seller_id,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at
      `;

      // Persist uncommitted events to outbox
      const outbox = new Outbox(new PostgresOutboxAdapter(tx));
      for (const event of listing.uncommittedEvents) {
        await outbox.insert(event);
      }
    });

    listing.clearEvents();
  }

  async delete(id: string): Promise<void> {
    await this.sql`
      DELETE FROM marketplace.listings
      WHERE id = ${id}
    `;
  }
}
