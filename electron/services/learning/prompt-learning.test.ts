import { expect, it } from 'vitest';
import { extractPromptPattern } from './prompt-learning';

it('保留提示词原文并提取可验证模块', () => {
  const pattern = extractPromptPattern('电影人像\n成年女性，黑色长发，夜景，85mm 镜头，暖白主光');
  expect(pattern.status).toBe('candidate');
  expect(pattern.scope).toEqual(expect.arrayContaining(['人物', '场景', '光线', '镜头']));
  expect(pattern.module).toContain('85mm');
});
