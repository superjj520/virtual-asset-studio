import type { ImageUnderstandingReport, ReversePrompt } from '../../../src/shared/types';

const clean = (value: string) => value.trim().replace(/\s+/g, ' ');

/** 将视觉模型的可见观察固定编排为可编辑的反推提示词，而非声称复刻原图。 */
export const buildReversePrompt = (report: ImageUnderstandingReport): ReversePrompt => {
  const modules = [
    ['人物主体', report.subject],
    ['身份与外观锚点', report.identityAnchor],
    ['服装与体态', report.bodyAndWardrobe],
    ['表情与姿势', report.expressionAndPose],
    ['场景与氛围', report.scene],
    ['光线与材质', report.lighting],
    ['镜头与构图', report.camera],
    ['视觉媒介', report.style],
  ].map(([label, value]) => ({ label, value: clean(value) })).filter((item) => item.value);
  const prompt = [
    ...modules.map((item) => `${item.label}：${item.value}`),
    report.continuityLocks.length ? `保持：${report.continuityLocks.map(clean).filter(Boolean).join('；')}` : '',
    report.risks.length ? `避免：${report.risks.map(clean).filter(Boolean).join('；')}` : '',
  ].filter(Boolean).join('；');
  return { prompt, modules, changeOptions: ['场景', '姿势', '服装', '光线', '镜头'] };
};
