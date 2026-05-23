import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add columns one at a time (SQLite compatible)
  const columns = [
    { name: 'user_id', add: (t: Knex.AlterTableBuilder) => t.string('user_id') },
    { name: 'phone', add: (t: Knex.AlterTableBuilder) => t.string('phone') },
    { name: 'designation', add: (t: Knex.AlterTableBuilder) => t.string('designation') },
    { name: 'company_name', add: (t: Knex.AlterTableBuilder) => t.string('company_name') },
    { name: 'email_verified', add: (t: Knex.AlterTableBuilder) => t.boolean('email_verified').defaultTo(false) },
    { name: 'verification_token', add: (t: Knex.AlterTableBuilder) => t.string('verification_token') },
    { name: 'verification_token_expires', add: (t: Knex.AlterTableBuilder) => t.string('verification_token_expires') },
    { name: 'updated_at', add: (t: Knex.AlterTableBuilder) => t.timestamp('updated_at') },
  ];

  for (const col of columns) {
    const exists = await knex.schema.hasColumn('users', col.name);
    if (!exists) {
      await knex.schema.alterTable('users', col.add);
    }
  }

  // Mark existing users as verified
  await knex('users').whereNull('email_verified').orWhere('email_verified', false).update({ email_verified: true });
}

export async function down(knex: Knex): Promise<void> {
  // SQLite doesn't support DROP COLUMN easily
}
