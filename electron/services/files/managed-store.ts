import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import sharp from 'sharp';

export class ManagedStore {
  constructor(private readonly rootDirectory: string) {
    mkdirSync(this.rootDirectory, { recursive: true });
  }

  copySource(sourcePath: string, sha256: string): string {
    const extension = extname(sourcePath).toLowerCase() || '.bin';
    const managedPath = join(this.rootDirectory, sha256, `source${extension}`);
    mkdirSync(dirname(managedPath), { recursive: true });
    if (!existsSync(managedPath)) copyFileSync(sourcePath, managedPath);
    return managedPath;
  }

  async createThumbnail(sourcePath: string, sha256: string): Promise<string | undefined> {
    const thumbnailPath = join(this.rootDirectory, sha256, 'thumbnail.webp');
    try {
      await sharp(sourcePath).rotate().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(thumbnailPath);
      return thumbnailPath;
    } catch {
      return undefined;
    }
  }

  exists(filePath: string): boolean {
    return existsSync(filePath);
  }

  writeGenerated(value: Buffer, sha256: string, extension: string): string {
    const managedPath = join(this.rootDirectory, sha256, `generated${extension}`);
    mkdirSync(dirname(managedPath), { recursive: true });
    if (!existsSync(managedPath)) writeFileSync(managedPath, value);
    return managedPath;
  }
}
