import knex, { Knex } from 'knex';
import config from './knexfile.js';

const environment = process.env.NODE_ENV || 'development';

let db: Knex;

export function getDb(): Knex {
  if (!db) {
    db = knex(config[environment]!);
  }
  return db;
}

export function createDb(env?: string): Knex {
  const envConfig = config[env || environment]!;
  return knex(envConfig);
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
  }
}

export default getDb;
