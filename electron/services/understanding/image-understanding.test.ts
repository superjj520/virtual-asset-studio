import { describe, expect, it } from 'vitest';
import { parseImageUnderstanding } from './image-understanding';

describe('parseImageUnderstanding', () => {
  it('将模型 JSON 报告变为可回填角色和镜头的字段', () => {
    const report = parseImageUnderstanding('```json\n{"subject":"成年女性","identityAnchor":"黑色长发、杏仁眼","bodyAndWardrobe":"月白礼服","expressionAndPose":"安静直视","scene":"暗蓝夜景","lighting":"左前方柔光","camera":"85mm 近景","style":"真实电影人像","continuityLocks":["发型不变","服装不变"],"risks":["背景元素过密"],"editablePrompt":"夜景肖像"}\n```');
    expect(report.identityAnchor).toBe('黑色长发、杏仁眼');
    expect(report.continuityLocks).toEqual(['发型不变', '服装不变']);
    expect(report.rawResponse).toContain('成年女性');
  });

  it('在模型没有输出 JSON 时保留原文，不伪造理解结果', () => {
    const report = parseImageUnderstanding('这是一条无法解析的模型回复');
    expect(report.subject).toBe('');
    expect(report.editablePrompt).toBe('这是一条无法解析的模型回复');
  });
});
