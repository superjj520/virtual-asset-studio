import type { AssetCollectionMember, ConfirmationStatus } from "../shared/types";
import type { AssetCollectionModuleDefinition } from "../shared/asset-collection-blueprints";

export type CollectionRightsFilter = "all" | "usable" | "pending" | "restricted";
export type CollectionAssetFilters = {
  query: string;
  moduleKey: string;
  confirmation: "all" | ConfirmationStatus;
  rights: CollectionRightsFilter;
};

export const filterCollectionAssets = (assets: AssetCollectionMember[], filters: CollectionAssetFilters) => {
  const query = filters.query.trim().toLocaleLowerCase();
  return assets.filter((asset) => {
    if (query && ![asset.name, asset.membershipRole, asset.notes ?? ""].some((value) => value.toLocaleLowerCase().includes(query))) return false;
    if (filters.moduleKey !== "all" && asset.moduleKey !== filters.moduleKey) return false;
    if (filters.confirmation !== "all" && asset.confirmation !== filters.confirmation) return false;
    if (filters.rights === "usable" && !["authorized", "original"].includes(asset.rightsStatus)) return false;
    if (filters.rights === "pending" && asset.rightsStatus !== "unknown") return false;
    if (filters.rights === "restricted" && asset.rightsStatus !== "restricted") return false;
    return true;
  });
};

type Props = {
  filters: CollectionAssetFilters;
  modules: AssetCollectionModuleDefinition[];
  resultCount: number;
  totalCount: number;
  onChange: (filters: CollectionAssetFilters) => void;
};

export function CollectionAssetFilterBar({ filters, modules, resultCount, totalCount, onChange }: Props) {
  const update = <K extends keyof CollectionAssetFilters>(key: K, value: CollectionAssetFilters[K]) =>
    onChange({ ...filters, [key]: value });
  return (
    <div className="collection-filter-bar" aria-label="资产包素材筛选">
      <label>搜索<input value={filters.query} onChange={(event) => update("query", event.target.value)} placeholder="名称、用途或备注" /></label>
      <label>模块<select value={filters.moduleKey} onChange={(event) => update("moduleKey", event.target.value)}>
        <option value="all">全部模块</option>
        {modules.map((module) => <option key={module.key} value={module.key}>{module.label}</option>)}
      </select></label>
      <label>审片<select value={filters.confirmation} onChange={(event) => update("confirmation", event.target.value as CollectionAssetFilters["confirmation"])}>
        <option value="all">全部状态</option><option value="confirmed">已确认</option><option value="draft">待审片</option><option value="rejected">已淘汰</option>
      </select></label>
      <label>权利<select value={filters.rights} onChange={(event) => update("rights", event.target.value as CollectionRightsFilter)}>
        <option value="all">全部状态</option><option value="usable">可使用</option><option value="pending">待核实</option><option value="restricted">受限制</option>
      </select></label>
      <span>{resultCount}/{totalCount} 项</span>
    </div>
  );
}
