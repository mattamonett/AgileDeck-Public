import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AdminError } from './admin-errors';

/** Member references in the admin page stop working after an hour. */
const REFERENCE_TTL_MS = 60 * 60_000;

const key = randomBytes(32);
const payloadSchema = z.strictObject({
  roomId: z.string().max(50),
  visitorId: z.string().min(1).max(128),
  expires: z.number(),
});
export function memberReference(roomId: string, visitorId: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify({
        roomId,
        visitorId,
        expires: Date.now() + REFERENCE_TTL_MS,
      }),
      'utf8',
    ),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function resolveMemberReference(roomId: string, reference: string): string {
  try {
    const bytes = Buffer.from(reference, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12), {
      authTagLength: 16,
    });
    decipher.setAuthTag(bytes.subarray(12, 28));
    const value: unknown = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
    );
    const payload = payloadSchema.parse(value);
    if (payload.roomId !== roomId || payload.expires < Date.now())
      throw new Error('Expired reference');
    return payload.visitorId;
  } catch {
    throw new AdminError(409, 'This member reference expired. Refresh the room before deleting.');
  }
}
