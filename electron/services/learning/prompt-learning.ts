import type { LearningPattern } from '../../../src/shared/types';

const firstNonEmpty = (lines: string[]) => lines.map((line) => line.trim()).find(Boolean) ?? '未命名模式';

export const extractPromptPattern = (prompt: string): Omit<LearningPattern, 'id' | 'createdAt' | 'updatedAt'> => {
  const normalized = prompt.replace(/\r/g, '').trim();
  const lines = normalized.split('\n');
  const name = firstNonEmpty(lines).slice(0, 40);
  const modules = [
    ['人物', /人物|女性|男性|脸|发型|五官/], ['服装', /服装|礼服|穿着|裙|鞋/], ['场景', /场景|背景|环境|教室|夜|室内|室外/],
    ['光线', /光|曝光|阴影|轮廓光|主光/], ['镜头', /镜头|焦段|mm|光圈|视角/], ['风格', /风格|电影|摄影|胶片|写实|编辑/]
  ].filter(([, matcher]) => (matcher as RegExp).test(normalized)).map(([label]) => String(label));
  const reusableLines = lines.filter((line) => /光|曝光|阴影|轮廓光|主光|镜头|焦段|mm|光圈|视角|风格|电影|摄影|胶片|写实|编辑/.test(line))
    .map((line) => line.trim()).filter(Boolean).slice(0, 6).join('；').slice(0, 700);
  return {
    name: `提示词模式：${name}`,
    status: 'candidate',
    scope: modules,
    module: reusableLines || `候选策略范围：${modules.join('、') || '通用描述'}。请在一次真实生成中验证后再启用。`,
    rawInput: normalized,
    evidence: ['用户提供的原始提示词', `结构化提取：${modules.join('、') || '通用描述'}`],
    contraindications: ['需结合具体项目、参考资产与生成结果验证后，才可作为默认模式。']
  };
};
