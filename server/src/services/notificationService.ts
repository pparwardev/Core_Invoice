import { Knex } from 'knex';

export interface CreateNotificationParams {
  type: string;
  title: string;
  message: string;
  vendor_id?: number | null;
}

export async function createNotification(
  db: Knex,
  params: CreateNotificationParams
): Promise<number> {
  const result = await db('notifications').insert({
    type: params.type,
    title: params.title,
    message: params.message,
    vendor_id: params.vendor_id || null,
    read: false,
    created_at: db.fn.now(),
  }).returning('id');
  if (!result || result.length === 0) return 0;
  return typeof result[0] === 'object' ? (result[0] as any).id : result[0];
}

/**
 * Check if a notification with the same title already exists (to avoid duplicates)
 */
export async function notificationExists(db: Knex, title: string): Promise<boolean> {
  const existing = await db('notifications').where('title', title).first();
  return !!existing;
}
