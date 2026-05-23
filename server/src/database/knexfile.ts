import type { Knex } from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use PostgreSQL in production (Render), SQLite locally
const DATABASE_URL = process.env.DATABASE_URL;

const config: Record<string, Knex.Config> = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(__dirname, '../../data/core-invoice.db'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, './migrations'),
    },
    seeds: {
      directory: path.resolve(__dirname, './seeds'),
    },
  },
  test: {
    client: 'better-sqlite3',
    connection: {
      filename: ':memory:',
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, './migrations'),
    },
    seeds: {
      directory: path.resolve(__dirname, './seeds'),
    },
  },
  production: DATABASE_URL
    ? {
        client: 'pg',
        connection: {
          connectionString: DATABASE_URL,
          ssl: { rejectUnauthorized: false },
        },
        pool: { min: 1, max: 5 },
        migrations: {
          directory: path.resolve(__dirname, './migrations'),
          loadExtensions: ['.js'],
        },
        seeds: {
          directory: path.resolve(__dirname, './seeds'),
          loadExtensions: ['.js'],
        },
      }
    : {
        client: 'better-sqlite3',
        connection: {
          filename: path.resolve(__dirname, '../../data/core-invoice.db'),
        },
        useNullAsDefault: true,
        migrations: {
          directory: path.resolve(__dirname, './migrations'),
          loadExtensions: ['.js'],
        },
        seeds: {
          directory: path.resolve(__dirname, './seeds'),
          loadExtensions: ['.js'],
        },
      },
};

export default config;
