import { statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import sharp from 'sharp';
import type { Asset, AssetType, RightsStatus } from '../../../src/shared/types';
import { AssetRepository } from '../assets/repository';
import { ManagedStore } from '../files/managed-store';
import { hashFile } from '../files/hash';
import { createImageSuggestions, type UnderstandingSuggestion } from '../understanding/image-understanding';

export type ImportAssetInput = {
  filePath: string;
  /** 可选的稳定来源记录；例如压缩包导入时不能把临时解压路径当成来源。 */
  sourcePath?: string;
  type?: AssetType;
  projectId?: string;
  rightsStatus: RightsStatus;
  rightsReason?: string;
  secondaryCategory?: string;
};

export type ImportResult = {
  asset: Asset;
  thumbnailPath?: string;
  suggestions: UnderstandingSuggestion[];
  duplicateOf?: Asset;
};

const mediaTypeFor = (filePath: string): string => {
  const extension = extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.txt': 'text/plain', '.md': 'text/markdown'
  };
  return types[extension] ?? 'application/octet-stream';
};

const isImage = (mediaType: string) => mediaType.startsWith('image/');
const assertCompatibleRights = (asset: Asset, input: ImportAssetInput): void => {
  if (asset.rightsStatus !== input.rightsStatus)
    throw new Error('相同素材的权利状态不一致；请到素材库复核后再关联到项目，不能沿用旧授权。');
  if (['authorized', 'original'].includes(input.rightsStatus) && asset.metadata.rightsReviewNote !== input.rightsReason?.trim())
    throw new Error('相同素材的授权依据不一致；请到素材库核实使用范围后再关联到项目。');
};

export class ImportService {
  constructor(private readonly assets: AssetRepository, private readonly store: ManagedStore) {}

  async import(input: ImportAssetInput): Promise<ImportResult> {
    if (!['unknown', 'authorized', 'original', 'restricted'].includes(input.rightsStatus)) throw new Error('无效的素材使用权状态。');
    if (['authorized', 'original'].includes(input.rightsStatus) && !input.rightsReason?.trim())
      throw new Error('声明授权或原创时必须填写可使用的依据。');
    const sha256 = await hashFile(input.filePath);
    const existing = this.assets.findByHash(sha256);
    if (existing) {
      assertCompatibleRights(existing, input);
      return { asset: existing, duplicateOf: existing, suggestions: [] };
    }

    const mediaType = mediaTypeFor(input.filePath);
    const managedPath = this.store.copySource(input.filePath, sha256);
    const metadata: Record<string, unknown> = {
      bytes: statSync(input.filePath).size,
      rightsReview: ['authorized', 'original'].includes(input.rightsStatus) ? 'approved' : 'pending',
      rightsReviewNote: input.rightsReason?.trim() ?? '',
      rightsReviewedAt: new Date().toISOString(),
      ...(input.secondaryCategory?.trim()
        ? { secondaryCategory: input.secondaryCategory.trim() }
        : {}),
    };
    let thumbnailPath: string | undefined;
    if (isImage(mediaType)) {
      const imageMetadata = await sharp(input.filePath).metadata();
      metadata.width = imageMetadata.width;
      metadata.height = imageMetadata.height;
      metadata.format = imageMetadata.format;
      thumbnailPath = await this.store.createThumbnail(input.filePath, sha256);
    }
    const type = input.type ?? (isImage(mediaType) ? 'reference_image' : mediaType.startsWith('video/') ? 'video' : mediaType.startsWith('audio/') ? 'audio' : 'prompt_pattern');
    const result = this.assets.createOrGet({
      type,
      name: basename(input.filePath, extname(input.filePath)),
      managedPath,
      sourcePath: input.sourcePath ?? input.filePath,
      sha256,
      mediaType,
      rightsStatus: input.rightsStatus,
      metadata
    });
    if (!result.created) {
      assertCompatibleRights(result.asset, input);
      return { asset: result.asset, duplicateOf: result.asset, suggestions: [] };
    }
    const suggestions = createImageSuggestions({ type, rightsStatus: input.rightsStatus, width: metadata.width as number | undefined, height: metadata.height as number | undefined });
    return { asset: result.asset, thumbnailPath, suggestions };
  }

  removeImportedAsset(assetId: string): void {
    this.assets.remove(assetId);
  }
}
