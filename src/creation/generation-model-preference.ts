import { GENERATION_MODELS } from "../shared/generation-models";

const KEY = "studio.generation-model";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const defaultStorage = (): StorageLike | undefined =>
  typeof window === "undefined" ? undefined : window.localStorage;

export function readGenerationModelPreference(storage: StorageLike | undefined = defaultStorage()): string | undefined {
  if (!storage) return undefined;
  try {
    const value = storage.getItem(KEY);
    return value && GENERATION_MODELS.some((model) => model.id === value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writeGenerationModelPreference(
  modelId: string | undefined,
  storage: StorageLike | undefined = defaultStorage(),
) {
  if (!storage) return;
  try {
    if (modelId && GENERATION_MODELS.some((model) => model.id === modelId)) storage.setItem(KEY, modelId);
    else storage.removeItem(KEY);
  } catch {
    // 存储不可用时不影响本次选择。
  }
}
