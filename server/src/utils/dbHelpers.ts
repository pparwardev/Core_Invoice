import { Knex } from 'knex';

/**
 * Insert a row and return the ID.
 * Works with both SQLite (returns [number]) and PostgreSQL (returns [{id: number}]).
 */
export async function insertAndGetId(db: Knex, table: string, data: Record<string, any>): Promise<number> {
  const result = await db(table).insert(data).returning('id');
  if (!result || result.length === 0) {
    // Fallback: get last inserted id
    const last = await db(table).max('id as id').first();
    return last?.id || 0;
  }
  // PostgreSQL returns [{id: number}], SQLite returns [number]
  return typeof result[0] === 'object' ? result[0].id : result[0];
}
