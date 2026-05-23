import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add service_type column to invoices table for bill filtering by service
  const hasColumn = await knex.schema.hasColumn('invoices', 'service_type');
  if (!hasColumn) {
    await knex.schema.alterTable('invoices', (t) => {
      t.string('service_type').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('invoices', 'service_type');
  if (hasColumn) {
    await knex.schema.alterTable('invoices', (t) => {
      t.dropColumn('service_type');
    });
  }
}
