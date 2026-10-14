import { createHash } from 'node:crypto';

export function hashSubmissionCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}
