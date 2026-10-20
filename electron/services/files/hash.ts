import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const hashFile = async (filePath: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

export const hashBuffer = (value: Buffer): string => createHash('sha256').update(value).digest('hex');
