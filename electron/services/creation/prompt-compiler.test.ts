import { expect, it } from 'vitest';
import { compilePrompt, compileShotContract } from './prompt-compiler';

it('将创作卡编译为可审查的模块化提示词', () => {
  const result = compilePrompt({
    intent: '古风电影人像', subject: '成年东方女性', identityAnchor: '清冷气质与黑色长发', bodyAndWardrobe: '月白礼服', expressionAndPose: '直视镜头', scene: '深蓝夜景', lighting: '暖白主光与冷色轮廓光', camera: '85mm 头肩肖像', style: '真人电影摄影', avoid: '卡通、文字、水印', aspectRatio: '1:1', referenceAssetIds: []
  });
  expect(result.positive).toContain('人物主体：成年东方女性');
  expect(result.negative).toBe('卡通、文字、水印');
});

it('将必须保持项编译为高优先级贴合锚点', () => {
  const result = compilePrompt({
    intent: '角色场景创作', subject: '成年女性', identityAnchor: '黑色长发', bodyAndWardrobe: '', expressionAndPose: '', scene: '玻璃温室', lighting: '', camera: '', style: '',
    mustKeep: '脸型、黑色长发与月白礼服保持不变；只把场景换成玻璃温室',
    avoid: '', aspectRatio: '9:16', referenceAssetIds: []
  });
  expect(result.positive).toContain('必须贴合：脸型、黑色长发与月白礼服保持不变；只把场景换成玻璃温室');
});

it('将历史资产包中的非标准画幅归一化，避免界面与提示词不一致', () => {
  const result = compilePrompt({
    intent: '角色创作', subject: '成年女性', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '',
    avoid: '', aspectRatio: '4:5' as never, referenceAssetIds: [],
  });
  expect(result.positive).toContain('画幅：2:3');
});

it('将图生视频约束编译为单动作镜头合同', () => {
  const result = compileShotContract({
    subjectAnchor: '角色脸型、发型与礼服不变', referenceAssetIds: [], startFrame: '人物安静直视镜头', action: '一阵微风吹动碎发', cameraMotion: '缓慢推近', durationSeconds: 4, frameRate: 24, keep: ['脸部身份一致'], avoid: ['手指变形'], output: { aspectRatio: '9:16', resolution: '1080p' }
  });
  expect(result).toContain('唯一动作：一阵微风吹动碎发');
  expect(result).toContain('身份漂移');
});

it('静态图片镜头合同不混入时长和帧率', () => {
  const result = compileShotContract({
    deliveryType: 'image', subjectAnchor: '同一成年角色', referenceAssetIds: [], startFrame: '人物位于画面右侧',
    action: '回眸直视镜头', cameraMotion: '85mm 平视半身', durationSeconds: 4, frameRate: 24,
    keep: ['脸与服装不变'], avoid: ['文字'], output: { aspectRatio: '2:3', resolution: '1080p' },
  });
  expect(result).toContain('画面构图：人物位于画面右侧');
  expect(result).toContain('姿态与动作：回眸直视镜头');
  expect(result).toContain('输出：2:3，高质量静态图片');
  expect(result).not.toContain('时长与帧率');
});
