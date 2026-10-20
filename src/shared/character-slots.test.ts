import { expect, it } from 'vitest';
import * as characterSlots from './character-slots';
import type { CharacterDetail, CharacterFact, CharacterFactEvidence } from './types';

const detail = (facts: CharacterFact[] = []): CharacterDetail => ({
  id: 'char-1', name: '蝶灵', group: 'lead', lifecycle: 'draft',
  card: { intent: '角色', subject: '成年女性', identityAnchor: '原有身份设定', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '', avoid: '', aspectRatio: '2:3', referenceAssetIds: [] },
  specification: { identityLocks: [], wardrobeLocks: [], visualMotifs: [], forbiddenChanges: [], requiredAssetKinds: [] },
  createdAt: '', updatedAt: '', masterAssetId: 'source-1', variants: [
    { id: 'look-1', profileId: 'char-1', kind: 'look', name: '冬季旅行', createdAt: '', updatedAt: '' },
    { id: 'look-2', profileId: 'char-1', kind: 'look', name: '正式礼服', createdAt: '', updatedAt: '' },
  ], facts,
  evidenceAssets: [
    { id: 'source-1', type: 'image', name: '可信参考', managedPath: '', sha256: '', mediaType: 'image/png', rightsStatus: 'authorized', confirmation: 'confirmed', metadata: {}, createdAt: '', updatedAt: '' },
    { id: 'source-2', type: 'image', name: '未审核参考', managedPath: '', sha256: '', mediaType: 'image/png', rightsStatus: 'unknown', confirmation: 'draft', metadata: {}, createdAt: '', updatedAt: '' },
  ],
});
const fact = (slotKey: string, value: string, state: CharacterFact['state'] = 'confirmed', variantId?: string, evidence: CharacterFactEvidence[] = []): CharacterFact => ({
  id: `${slotKey}-${variantId ?? 'base'}`, profileId: 'char-1', slotKey,
  group: slotKey.split('.')[0], label: slotKey, value, state, variantId,
  evidence, note: '', updatedAt: '',
});

it('按肖像、全身和连续镜头分别检查必需项，裤装和裙装不是同时必填', () => {
  const api = characterSlots as unknown as { evaluateCharacterCoverage: (detail: CharacterDetail, purpose: string, selection?: { look?: string }) => { status: string; missingRequiredKeys: string[]; requiredCount: number; confirmedRequiredCount: number } };
  const portrait = api.evaluateCharacterCoverage(detail(), 'portrait');
  const fullBody = api.evaluateCharacterCoverage(detail(), 'full_body');
  expect(portrait.missingRequiredKeys).toContain('view.face_front');
  expect(fullBody.missingRequiredKeys).toContain('view.front');
  expect(fullBody.missingRequiredKeys).toContain('wardrobe.lower');
  expect(fullBody.missingRequiredKeys).not.toContain('wardrobe.pants');
  expect(fullBody.missingRequiredKeys).not.toContain('wardrobe.skirt');
  expect(fullBody.requiredCount).toBeGreaterThan(portrait.requiredCount);
});

it('服装层次分开记录外衣、内搭、内衣上装、内裤、裤裙、鞋袜和材质，不把可选项一起强制必填', () => {
  const keys = characterSlots.CHARACTER_SLOTS.map((slot) => slot.key);
  expect(keys).toEqual(expect.arrayContaining([
    'wardrobe.outerwear', 'wardrobe.innerwear', 'wardrobe.underwear_top', 'wardrobe.underwear_bottom',
    'wardrobe.pants', 'wardrobe.skirt', 'wardrobe.dress', 'wardrobe.socks', 'wardrobe.shoes', 'wardrobe.fabric',
  ]));
  expect(characterSlots.CHARACTER_SLOTS.filter((slot) => ['wardrobe.underwear_top', 'wardrobe.underwear_bottom'].includes(slot.key)).every((slot) => slot.requiredFor.length === 0)).toBe(true);
});

it('只把已确认且来源仍然可用的细项计入完整度，视角必须有图片证据', () => {
  const api = characterSlots as unknown as { evaluateCharacterCoverage: (detail: CharacterDetail, purpose: string) => { status: string; missingRequiredKeys: string[]; confirmedRequiredCount: number; requiredCount: number } };
  const required = characterSlots.CHARACTER_SLOTS.filter((slot) => slot.requiredFor.includes('portrait'));
  const populated = required.map((slot) => fact(slot.key, slot.label, 'confirmed', undefined, slot.visualEvidence ? [{ assetId: 'source-2' }] : []));
  expect(api.evaluateCharacterCoverage(detail(populated), 'portrait').missingRequiredKeys).toContain('view.face_front');
  const evidenceReady = populated.map((item) => item.slotKey === 'view.face_front' ? { ...item, evidence: [{ assetId: 'source-1', regionNote: '正面面部' }] } : item);
  const result = api.evaluateCharacterCoverage(detail(evidenceReady), 'portrait');
  expect(result.status).toBe('ready');
  expect(result.missingRequiredKeys).toEqual([]);
  expect(result.confirmedRequiredCount).toBe(result.requiredCount);
});

it('创作卡仅继承已确认恒定设定和所选造型，排除草稿与不可用素材', () => {
  const api = characterSlots as unknown as { composeCharacterCard: (detail: CharacterDetail, selection?: { look?: string }) => CharacterDetail['card'] };
  const character = detail([
    fact('face.shape', '柔和鹅蛋脸'),
    fact('hair.style', '未经确认的卷发', 'draft'),
    fact('wardrobe.outerwear', '粉色羊毛外套', 'confirmed', 'look-1', [{ assetId: 'source-1', regionNote: '左上角' }]),
    fact('wardrobe.outerwear', '黑色高定外套', 'confirmed', 'look-2'),
    fact('pose.standing', '等待审核的站姿', 'draft', undefined, [{ assetId: 'source-2' }]),
  ]);
  const card = api.composeCharacterCard(character, { look: 'look-1' });
  expect(card.identityAnchor).toContain('柔和鹅蛋脸');
  expect(card.identityAnchor).not.toContain('未经确认');
  expect(card.bodyAndWardrobe).toContain('粉色羊毛外套');
  expect(card.bodyAndWardrobe).not.toContain('黑色高定外套');
  expect(card.expressionAndPose).not.toContain('等待审核');
  expect(card.referenceAssetIds).toEqual(['source-1']);
});

it('结构化事实优先于旧自由文本，未核验的旧设定不能重新混入任务', () => {
  const character = detail([fact('face.eyes', '深棕色眼睛')]);
  character.card.subject = '蓝眼睛的陌生人';
  character.card.identityAnchor = '蓝眼睛，银发';
  character.card.mustKeep = '必须蓝眼睛';
  const card = characterSlots.composeCharacterCard(character);
  expect(`${card.subject} ${card.identityAnchor} ${card.mustKeep}`).not.toContain('蓝眼睛');
  expect(card.identityAnchor).toContain('深棕色眼睛');
});

it('草稿变体不覆盖已确认的基础设定，视觉角度不能用音频当证据', () => {
  const character = detail([
    fact('wardrobe.outerwear', '月白长袍'),
    fact('wardrobe.outerwear', '待确认的红袍', 'draft', 'look-1'),
    fact('view.face_front', '正脸', 'confirmed', undefined, [{ assetId: 'sound-1' }]),
  ]);
  character.evidenceAssets.push({ ...character.evidenceAssets[0], id: 'sound-1', type: 'audio', mediaType: 'audio/mpeg' });
  expect(characterSlots.composeCharacterCard(character, { look: 'look-1' }).bodyAndWardrobe).toContain('月白长袍');
  expect(characterSlots.evaluateCharacterCoverage(character, 'portrait').missingRequiredKeys).toContain('view.face_front');
});

it('非图片素材可以作为文字事实的证据，但不能混入生图参考图', () => {
  const character = detail([
    fact('identity.persona', '轻声说话', 'confirmed', undefined, [{ assetId: 'sound-1' }]),
  ]);
  character.evidenceAssets.push({ ...character.evidenceAssets[0], id: 'sound-1', type: 'audio', mediaType: 'audio/mpeg' });
  character.card.referenceAssetIds.push('sound-1');
  expect(characterSlots.composeCharacterCard(character).identityAnchor).toContain('轻声说话');
  expect(characterSlots.composeCharacterCard(character).referenceAssetIds).toEqual(['source-1']);
});
