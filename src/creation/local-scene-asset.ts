import type { CreativeCard, SceneKind } from "../shared/types";
import {
  GUIDED_STORY_ATMOSPHERES,
  GUIDED_STORY_MOMENTS,
  GUIDED_STORY_RELATIONSHIPS,
} from "./creative-plan";

const uniqueText = (...values: Array<string | undefined>) => [...new Set(values
  .flatMap((value) => value?.split("；") ?? [])
  .map((value) => value.trim())
  .filter(Boolean))].join("；");

const optionLabel = <T extends string>(
  options: Array<{ id: T; label: string }>,
  id?: string,
) => options.find((item) => item.id === id)?.label;

export const inferSceneKind = (card: CreativeCard): SceneKind => {
  const context = `${card.scene}；${card.style}`;
  if (/影棚|摄影棚|studio/i.test(context)) return "studio";
  if (/幻想|仙侠|魔法|超现实|梦境/.test(context)) return "fantasy";
  if (/室内|房间|大厅|走廊|教室|办公室|卧室/.test(context)) return "interior";
  if (/室外|街道|城市|森林|海边|山谷|庭院/.test(context)) return "exterior";
  return "environment";
};

/**
 * 把已经确认的本地剧情方案转换为场景资产输入。
 * 这里只整理用户已经做出的选择，不调用模型，也不把视觉预演冒充成参考图。
 */
export const buildLocalSceneAssetDraft = ({
  card,
  characterName,
  directionLabel,
  directionDirective,
}: {
  card: CreativeCard;
  characterName?: string;
  directionLabel?: string;
  directionDirective?: string;
}) => {
  const relationship = optionLabel(GUIDED_STORY_RELATIONSHIPS, card.storyPlan?.relationshipId);
  const moment = optionLabel(GUIDED_STORY_MOMENTS, card.storyPlan?.momentId);
  const atmosphere = optionLabel(GUIDED_STORY_ATMOSPHERES, card.storyPlan?.atmosphereId);
  const sceneMoment = moment ?? directionLabel ?? "剧情场景";
  const owner = characterName?.trim() || "角色剧情";

  return {
    nameBase: `${owner} · ${sceneMoment}`,
    profile: {
      kind: inferSceneKind(card),
      lifecycle: "draft" as const,
      anchor: card.scene || sceneMoment,
      layout: card.camera,
      materials: card.style,
      colorSystem: card.lighting,
      requiredElements: uniqueText(relationship, moment, directionLabel, directionDirective),
      forbiddenChanges: uniqueText(card.mustKeep, card.avoid),
    },
    state: {
      name: uniqueText(directionLabel, atmosphere) || "基础状态",
      status: "active" as const,
      lighting: card.lighting,
      atmosphere: atmosphere ?? "",
      setDressing: card.scene,
      continuityNotes: card.mustKeep ?? "",
    },
  };
};
