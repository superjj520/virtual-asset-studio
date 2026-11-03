import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  CloudReferenceCatalog,
  CloudReferenceItem,
} from "../shared/reference-library";
import { ReferenceSheetComposer } from "./ReferenceSheetComposer";

afterEach(() => cleanup());

const BASE = "https://ai-pose-gallery.anhao.app";

const portraits: CloudReferenceItem[] = Array.from({ length: 3 }, (_, index) => ({
  id: `portrait-${index}`,
  kind: "portrait" as const,
  title: `人像 ${index + 1}`,
  category: "正脸参考",
  tags: ["人像"],
  thumbUrl: `${BASE}/thumbs/portrait-${index}.webp`,
  imageUrl: `${BASE}/img/portrait-${index}.webp`,
  sourceName: "POSE & CHARACTER Atlas",
  sourceUrl: `${BASE}/`,
}));

const items: CloudReferenceItem[] = Array.from({ length: 60 }, (_, index) => {
  const serial = String(index + 1).padStart(3, "0");
  return {
    id: `pose-P${serial}`,
    kind: "pose" as const,
    title: `站姿 ${serial}`,
    category: "全身单人",
    tags: ["站姿"],
    thumbUrl: `${BASE}/thumbs/P${serial}.jpg`,
    imageUrl: `${BASE}/img/P${serial}.jpg`,
    sourceName: "POSE & CHARACTER Atlas",
    sourceUrl: `${BASE}/`,
  };
});

const catalog: CloudReferenceCatalog = {
  sourceName: "POSE & CHARACTER Atlas",
  sourceUrl: `${BASE}/`,
  attribution: "测试用云端参考库",
  fetchedAt: "2026-11-02T00:00:00.000Z",
  counts: { portrait: 3, costume: 0, hair: 0, pose: 60, depth: 0, "anime-costume": 0,
    normal: 0 },
  items: [...portraits, ...items],
};

beforeEach(() => {
  (window as unknown as { studio: unknown }).studio = {
    referenceLibrary: {
      list: vi.fn().mockResolvedValue(catalog),
      import: vi.fn(),
      thumbnail: vi.fn().mockResolvedValue("data:image/webp;base64,AAAA"),
    },
    assets: { preview: vi.fn().mockResolvedValue("") },
    referenceSheets: { compose: vi.fn() },
  };
});

const openCloudTab = async () => {
  render(
    <ReferenceSheetComposer
      assets={[]}
      onClose={() => undefined}
      onUse={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "云端图库" }));
  await screen.findByText(/张已显示/);
};

it("云端图库先铺 48 张，并说清还剩多少", async () => {
  await openCloudTab();
  expect(screen.getByText(/48 张已显示 \/ 匹配 63/)).toBeInTheDocument();
  expect(screen.queryByText("站姿 060")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /再看 15 张/ })).toBeInTheDocument();
});

it("点「再看」把剩下的铺出来，按钮随之消失", async () => {
  await openCloudTab();
  fireEvent.click(screen.getByRole("button", { name: /再看 15 张/ }));
  await waitFor(() => {
    expect(screen.getByText(/63 张已显示 \/ 匹配 63/)).toBeInTheDocument();
  });
  expect(screen.getByText("站姿 060")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /再看/ })).not.toBeInTheDocument();
});

it("改搜索词后回到第一页，不沿用上一次的展开深度", async () => {
  await openCloudTab();
  fireEvent.click(screen.getByRole("button", { name: /再看 15 张/ }));
  await waitFor(() => {
    expect(screen.getByText(/63 张已显示/)).toBeInTheDocument();
  });
  fireEvent.change(screen.getByPlaceholderText("搜名称、分类或标签"), {
    target: { value: "站姿 05" },
  });
  await waitFor(() => {
    expect(screen.getByText(/张已显示 \/ 匹配 10/)).toBeInTheDocument();
  });
});

it("搜索时跨全部分类，不会因为停在人像分类就搜不到姿势", async () => {
  await openCloudTab();
  fireEvent.click(screen.getByRole("button", { name: "人像 3" }));
  await waitFor(() => {
    expect(screen.getByText(/3 张已显示 \/ 匹配 3/)).toBeInTheDocument();
  });
  fireEvent.change(screen.getByPlaceholderText("搜名称、分类或标签"), {
    target: { value: "站姿 060" },
  });
  await waitFor(() => {
    expect(screen.getByText("站姿 060")).toBeInTheDocument();
  });
  expect(screen.getByText(/搜索跨全部分类/)).toBeInTheDocument();
});

it("搜不到结果时给一键清除搜索词，不用手动删字", async () => {
  await openCloudTab();
  fireEvent.change(screen.getByPlaceholderText("搜名称、分类或标签"), {
    target: { value: "这个词库里肯定没有" },
  });
  await waitFor(() => {
    expect(screen.getByText(/当前筛选没有结果/)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole("button", { name: "清除搜索词" }));
  await waitFor(() => {
    expect(screen.getByText(/48 张已显示 \/ 匹配 63/)).toBeInTheDocument();
  });
});
