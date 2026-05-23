import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('login_history');
  if (!hasTable) {
    await knex.schema.createTable('login_history', (t) => {
      t.increments('id').primary();
      t.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
      t.string('user_name');
      t.string('login_id'); // what they typed to login
      t.boolean('success').defaultTo(true);
      t.string('ip_address');
      t.string('user_agent');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('login_history');
}
