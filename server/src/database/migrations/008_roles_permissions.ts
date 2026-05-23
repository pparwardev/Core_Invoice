import type { Knex } from 'knex';
import bcrypt from 'bcrypt';

export async function up(knex: Knex): Promise<void> {
  // Add role column to users
  const hasRole = await knex.schema.hasColumn('users', 'role');
  if (!hasRole) {
    await knex.schema.alterTable('users', (t) => {
      t.string('role').defaultTo('guest'); // admin, manager, associate, guest
    });
  }

  // Add is_active column to users
  const hasIsActive = await knex.schema.hasColumn('users', 'is_active');
  if (!hasIsActive) {
    await knex.schema.alterTable('users', (t) => {
      t.boolean('is_active').defaultTo(true);
    });
  }

  // Create permissions table
  const hasPermissions = await knex.schema.hasTable('user_permissions');
  if (!hasPermissions) {
    await knex.schema.createTable('user_permissions', (t) => {
      t.increments('id').primary();
      t.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
      t.string('module').notNullable(); // dashboard, vendors, billing, po_reader, company, profile, notifications, users
      t.boolean('can_view').defaultTo(false);
      t.boolean('can_create').defaultTo(false);
      t.boolean('can_edit').defaultTo(false);
      t.boolean('can_delete').defaultTo(false);
      t.unique(['user_id', 'module']);
    });
  }

  // Set first user as manager (admin)
  const firstUser = await knex('users').orderBy('id', 'asc').first();
  if (firstUser && !firstUser.role) {
    await knex('users').where('id', firstUser.id).update({ role: 'manager' });
  }

  // Set all existing users without role to 'manager' (backward compat)
  await knex('users').whereNull('role').orWhere('role', '').update({ role: 'manager' });

  // Create admin user if not exists
  const existingAdmin = await knex('users').where('user_id', 'admin').first();
  if (!existingAdmin) {
    const hash = await bcrypt.hash('Admin@2026', 10);
    await knex('users').insert({
      user_id: 'admin',
      name: 'Admin',
      email: 'admin@coreinvoice.com',
      password_hash: hash,
      role: 'admin',
      email_verified: true,
      is_active: true,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_permissions');
  // Remove admin user
  await knex('users').where('user_id', 'admin').del();
  // Remove is_active column
  const hasIsActive = await knex.schema.hasColumn('users', 'is_active');
  if (hasIsActive) {
    await knex.schema.alterTable('users', (t) => {
      t.dropColumn('is_active');
    });
  }
}
