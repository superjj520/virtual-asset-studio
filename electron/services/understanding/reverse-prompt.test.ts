import { describe, expect, it } from 'vitest';
import { buildReversePrompt } from './reverse-prompt';

describe('buildReversePrompt', () => {
  it('按固定视觉维度将理解报告编译为可编辑反推提示词', () => {
    const result = buildReversePrompt({
      subject: '成年东亚女性', identityAnchor: '黑色长发、杏仁眼', bodyAndWardrobe: '月白高领礼服',
      expressionAndPose: '安静直视镜头', scene: '深墨蓝夜景', lighting: '左前方柔光与银白轮廓光',
      camera: '85mm 头肩近景', style: '真人电影人像', continuityLocks: ['发型不变', '服装不变'],
      risks: ['不要复制可识别品牌标志'], editablePrompt: '', rawResponse: '{}',
    });

    expect(result.prompt).toContain('人物主体：成年东亚女性');
    expect(result.prompt).toContain('光线与材质：左前方柔光与银白轮廓光');
    expect(result.prompt).toContain('保持：发型不变；服装不变');
    expect(result.prompt).toContain('避免：不要复制可识别品牌标志');
    expect(result.changeOptions).toEqual(['场景', '姿势', '服装', '光线', '镜头']);
  });
});
