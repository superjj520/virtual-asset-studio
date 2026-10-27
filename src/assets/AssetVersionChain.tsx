import type { AssetLineageItem } from "../shared/types";

type Props = {
  current: { id: string; name: string };
  items: AssetLineageItem[];
  onSelect: (assetId: string) => void;
};

export function AssetVersionChain({ current, items, onSelect }: Props) {
  if (!items.length) return null;
  return <div className="asset-version-chain" aria-label="资产版本链">
    <strong>版本链 · {items.length + 1}</strong>
    <button type="button" aria-current="true" onClick={() => onSelect(current.id)}>
      当前 · {current.name}
    </button>
    {items.map((item) => <button key={item.asset.id} type="button" onClick={() => onSelect(item.asset.id)}>
      {item.direction === "source" ? "来源" : "衍生"} · {item.asset.name}
    </button>)}
  </div>;
}
