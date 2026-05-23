import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vendor_services', (t) => {
    t.integer('po_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
    t.string('po_number');
    t.string('item_code');
    t.string('hsn_sac');
    t.string('po_validity');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vendor_services', (t) => {
    t.dropColumn('po_id');
    t.dropColumn('po_number');
    t.dropColumn('item_code');
    t.dropColumn('hsn_sac');
    t.dropColumn('po_validity');
  });
}
