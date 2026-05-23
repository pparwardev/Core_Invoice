import type { Knex } from 'knex';

/**
 * Add vendor_services table.
 * One vendor = one account. Multiple services per vendor, each linked to a department.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vendor_services', (t) => {
    t.increments('id').primary();
    t.integer('vendor_id').references('id').inTable('vendors').onDelete('CASCADE');
    t.integer('section_id').references('id').inTable('sections').onDelete('CASCADE');
    t.string('service_type').notNullable();
    t.string('service_subtype');
    t.string('vendor_code'); // department-specific vendor code (r1, p1, m1 etc)
    t.string('vehicle_number');
    t.string('vehicle_model');
    t.integer('seating_capacity');
    t.boolean('is_active').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('vendor_services');
}
