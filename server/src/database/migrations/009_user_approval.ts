import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasApproved = await knex.schema.hasColumn('users', 'is_approved');
  if (!hasApproved) {
    await knex.schema.alterTable('users', (t) => {
      t.boolean('is_approved').defaultTo(false);
    });
  }
  // Auto-approve existing users and admin
  await knex('users').update({ is_approved: true });
  // Add last_login column
  const hasLastLogin = await knex.schema.hasColumn('users', 'last_login');
  if (!hasLastLogin) {
    await knex.schema.alterTable('users', (t) => {
      t.timestamp('last_login');
    });
  }
}

export async function down(knex: Knex): Promise<void> {}
