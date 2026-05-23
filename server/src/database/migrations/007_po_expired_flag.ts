import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('purchase_orders', 'is_expired');
  if (!hasColumn) {
    await knex.schema.alterTable('purchase_orders', (t) => {
      t.boolean('is_expired').defaultTo(false);
    });
  }

  // Auto-mark POs as expired where validity_date has passed
  const today = new Date().toISOString().split('T')[0];
  await knex('purchase_orders')
    .whereNotNull('validity_date')
    .where('validity_date', '<', today)
    .update({ is_expired: true });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('purchase_orders', 'is_expired');
  if (hasColumn) {
    await knex.schema.alterTable('purchase_orders', (t) => {
      t.dropColumn('is_expired');
    });
  }
}
