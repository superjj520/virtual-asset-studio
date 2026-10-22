import type { StudioJob } from "../shared/types";

export type JobFailureCategory =
  | "网络中断"
  | "远程状态待确认"
  | "输入校验"
  | "模型服务"
  | "应用中断"
  | "未知错误";

export const jobFailureCategory = (job: StudioJob): JobFailureCategory | undefined => {
  if (!job.error) return undefined;
  if (/应用关闭|应用中断|重启/.test(job.error)) return "应用中断";
  if (/网络|超时|fetch failed|连接/.test(job.error)) return "网络中断";
  if (job.status === "unknown" && (job.result?.remoteTask || job.result?.remoteId)) return "远程状态待确认";
  if (/格式|不存在|未关联|未确认|使用权|不支持|缺少|必须/.test(job.error)) return "输入校验";
  if (/模型|服务|响应|额度|API|provider/i.test(job.error)) return "模型服务";
  return "未知错误";
};

const stringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export const jobReferenceSummary = (job: StudioJob) => {
  const requested = stringArray(job.request.referenceAssetIds).length;
  const applied = stringArray(job.request.appliedReferenceAssetIds).length;
  if (!requested) return "无参考图";
  return `参考 ${requested} · 送模 ${applied}`;
};

export const jobAspectSummary = (job: StudioJob) => {
  const requested = typeof job.request.requestedAspectRatio === "string"
    ? job.request.requestedAspectRatio
    : "未记录";
  const actual = typeof job.request.actualAspectRatio === "string"
    ? job.request.actualAspectRatio
    : typeof job.result?.actualSize === "string"
      ? job.result.actualSize
      : "未记录";
  return requested === actual ? requested : `${requested} → ${actual}`;
};

export const jobRemoteSummary = (job: StudioJob) => {
  const remoteTask = job.result?.remoteTask;
  if (remoteTask && typeof remoteTask === "object" && !Array.isArray(remoteTask)) {
    const value = remoteTask as Record<string, unknown>;
    const requestId = typeof value.requestId === "string" ? value.requestId : "";
    const model = typeof value.model === "string" ? value.model : "";
    return [model, requestId ? `远程 ${requestId.slice(0, 10)}` : ""].filter(Boolean).join(" · ");
  }
  if (typeof job.result?.remoteId === "string") return `远程 ${job.result.remoteId.slice(0, 10)}`;
  if (typeof job.result?.assetId === "string") return `资产 ${job.result.assetId.slice(0, 10)}`;
  return "尚无远程或资产编号";
};
