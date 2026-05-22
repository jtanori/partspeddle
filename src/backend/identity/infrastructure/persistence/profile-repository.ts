/**
 * PostgreSQL Profile Repository
 *
 * Simple CRUD for Profile entity. No outbox integration needed
 * since Profile updates are not event-emitting in the current model.
 */

import type postgres from 'postgres';
import type { IProfileRepository } from '../../domain/repositories/profile-repository.js';
import { Profile } from '../../domain/entities/profile.js';

export class PostgresProfileRepository implements IProfileRepository {
  constructor(private readonly sql: ReturnType<typeof postgres>) {}

  async findByUserId(userId: string): Promise<Profile | null> {
    const rows = await this.sql`
      SELECT id, user_id, display_name, avatar_url
      FROM identity.profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as {
      id: string;
      user_id: string;
      display_name: string | null;
      avatar_url: string | null;
    };

    return new Profile({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
    });
  }

  async findById(id: string): Promise<Profile | null> {
    const rows = await this.sql`
      SELECT id, user_id, display_name, avatar_url
      FROM identity.profiles
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as {
      id: string;
      user_id: string;
      display_name: string | null;
      avatar_url: string | null;
    };

    return new Profile({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
    });
  }

  async save(profile: Profile): Promise<void> {
    await this.sql`
      INSERT INTO identity.profiles (id, user_id, display_name, avatar_url, created_at, updated_at)
      VALUES (${profile.id}, ${profile.userId}, ${profile.displayName ?? null}, ${profile.avatarUrl ?? null}, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
    `;
  }
}
