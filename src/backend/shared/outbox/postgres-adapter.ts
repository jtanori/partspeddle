/**
 * PostgreSQL adapter for the OutboxDbClient interface.
 *
 * Bridges the postgres-js tagged-template API with the OutboxDbClient
 * contract so repositories can use outbox within transactions.
 */

import postgres from 'postgres';
import type { OutboxDbClient } from './outbox.js';

export class PostgresOutboxAdapter implements OutboxDbClient {
  constructor(private readonly sql: ReturnType<typeof postgres>) {}

  async insert(table: string, data: Record<string, unknown>): Promise<void> {
    // postgres-js rejects undefined values; strip them so nulls survive
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    ) as Record<string, postgres.Serializable>;
    await this.sql`INSERT INTO ${this.sql(table)} ${this.sql(clean)}`;
  }

  async query<T>(sqlStr: string, params: unknown[]): Promise<T[]> {
    return this.sql.unsafe<T[]>(sqlStr, params as postgres.SerializableParameter[]);
  }

  async update(
    table: string,
    data: Record<string, unknown>,
    conditions: Record<string, unknown>,
  ): Promise<number> {
    const dataEntries = Object.entries(data);
    const conditionEntries = Object.entries(conditions);

    let paramIndex = 1;
    const setClause = dataEntries
      .map(([col]) => `"${col}" = $${paramIndex++}`)
      .join(', ');
    const whereClause = conditionEntries
      .map(([col]) => `"${col}" = $${paramIndex++}`)
      .join(' AND ');

    const sqlStr = `UPDATE "${table}" SET ${setClause} WHERE ${whereClause}`;
    const params = [
      ...dataEntries.map(([, v]) => v),
      ...conditionEntries.map(([, v]) => v),
    ];

    const result = await this.sql.unsafe(sqlStr, params as postgres.SerializableParameter[]);
    return result.count;
  }
}
