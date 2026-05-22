/**
 * PostgreSQL User Repository
 *
 * Implements IUserRepository with outbox integration.
 * Every save() persists the aggregate and its uncommitted events atomically.
 */

import type postgres from 'postgres';
import type { IUserRepository } from '../../domain/repositories/user-repository.js';
import { User } from '../../domain/entities/user.js';
import { Outbox } from '../../../shared/outbox/outbox.js';
import { PostgresOutboxAdapter } from '../../../shared/outbox/postgres-adapter.js';

export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly sql: ReturnType<typeof postgres>) {}

  async findById(id: string): Promise<User | null> {
    const rows = await this.sql`
      SELECT id, email, status
      FROM identity.users
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as { id: string; email: string; status: string };
    return User.rehydrate({
      id: row.id,
      email: row.email,
      status: row.status as 'active' | 'suspended' | 'deactivated',
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.sql`
      SELECT id, email, status
      FROM identity.users
      WHERE email = ${email}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as { id: string; email: string; status: string };
    return User.rehydrate({
      id: row.id,
      email: row.email,
      status: row.status as 'active' | 'suspended' | 'deactivated',
    });
  }

  async save(user: User): Promise<void> {
    await this.sql.begin(async (tx) => {
      // Upsert user
      await tx`
        INSERT INTO identity.users (id, auth_provider, email, status, created_at, updated_at)
        VALUES (${user.id}, 'supabase', ${user.email}, ${user.status}, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          status = EXCLUDED.status,
          updated_at = NOW()
      `;

      // Persist uncommitted events to outbox
      const outbox = new Outbox(new PostgresOutboxAdapter(tx));
      for (const event of user.uncommittedEvents) {
        await outbox.insert(event);
      }
    });

    user.clearEvents();
  }
}
