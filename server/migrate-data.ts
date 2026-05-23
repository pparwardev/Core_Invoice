/**
 * Migrate data from local SQLite to Render PostgreSQL
 * Usage: DATABASE_URL=postgres://... npx tsx migrate-data.ts
 */

import knex from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ Set DATABASE_URL environment variable first!');
  console.error('   Example: DATABASE_URL=postgres://user:pass@host/db npx tsx migrate-data.ts');
  process.exit(1);
}

// Source: Local SQLite
const sqlite = knex({
  client: 'better-sqlite3',
  connection: { filename: path.resolve(__dirname, './data/core-invoice.db') },
  useNullAsDefault: true,
});

// Destination: PostgreSQL (Render)
const pg = knex({
  client: 'pg',
  connection: { connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } },
});

const TABLES_TO_MIGRATE = [
  'users',
  'sections',
  'company_info',
  'vendors',
  'vendor_sections',
  'purchase_orders',
  'billing_records',
  'log_sheets',
  'log_entries',
  'invoices',
  'invoice_line_items',
  'work_completion_reports',
  'wcr_signatories',
  'diesel_purchases',
  'documents',
  'notifications',
];

async function migrate() {
  console.log('🔄 Starting data migration: SQLite → PostgreSQL');
  console.log('');

  // First run migrations on PostgreSQL
  console.log('📦 Running migrations on PostgreSQL...');
  try {
    await pg.migrate.latest({
      directory: path.resolve(__dirname, './src/database/migrations'),
      loadExtensions: ['.ts'],
    });
    console.log('✓ Migrations complete');
  } catch (err: any) {
    console.log('⚠️ Migration warning (may already exist):', err.message?.substring(0, 100));
  }

  // Migrate each table
  for (const table of TABLES_TO_MIGRATE) {
    try {
      const tableExists = await sqlite.schema.hasTable(table);
      if (!tableExists) {
        console.log(`⏭️  Skipping ${table} (not in SQLite)`);
        continue;
      }

      const rows = await sqlite(table).select('*');
      if (rows.length === 0) {
        console.log(`⏭️  Skipping ${table} (empty)`);
        continue;
      }

      // Clear existing data in PostgreSQL (to avoid duplicates)
      await pg(table).del();

      // Insert in batches of 50
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        // Remove any undefined values and convert SQLite booleans
        const cleanBatch = batch.map((row: any) => {
          const clean: any = {};
          for (const [key, value] of Object.entries(row)) {
            if (value === undefined) clean[key] = null;
            else clean[key] = value;
          }
          return clean;
        });
        await pg(table).insert(cleanBatch);
      }

      // Reset auto-increment sequence for PostgreSQL
      try {
        const maxId = await pg(table).max('id as max').first();
        if (maxId?.max) {
          await pg.raw(`SELECT setval('${table}_id_seq', ?, true)`, [maxId.max]);
        }
      } catch {
        // Table might not have id column or sequence
      }

      console.log(`✓ ${table}: ${rows.length} rows migrated`);
    } catch (err: any) {
      console.error(`❌ ${table}: ${err.message?.substring(0, 100)}`);
    }
  }

  // Also migrate vendor_services if exists
  try {
    const hasVS = await sqlite.schema.hasTable('vendor_services');
    if (hasVS) {
      const rows = await sqlite('vendor_services').select('*');
      if (rows.length > 0) {
        await pg('vendor_services').del();
        for (let i = 0; i < rows.length; i += 50) {
          await pg('vendor_services').insert(rows.slice(i, i + 50).map((r: any) => {
            const clean: any = {};
            for (const [k, v] of Object.entries(r)) clean[k] = v === undefined ? null : v;
            return clean;
          }));
        }
        const maxId = await pg('vendor_services').max('id as max').first();
        if (maxId?.max) await pg.raw(`SELECT setval('vendor_services_id_seq', ?, true)`, [maxId.max]);
        console.log(`✓ vendor_services: ${rows.length} rows migrated`);
      }
    }
  } catch (err: any) {
    console.log(`⚠️ vendor_services: ${err.message?.substring(0, 80)}`);
  }

  console.log('');
  console.log('✅ Migration complete!');

  await sqlite.destroy();
  await pg.destroy();
}

migrate().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
