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

const poseItem: CloudReferenceItem = {
  id: "pose-全身单人/P001",
  kind: "pose",
  title: "站姿 · 编号 P001",
  category: "全身单人",
  tags: ["站姿"],
  thumbUrl: `${BASE}/thumbs/P001.jpg`,
  imageUrl: `${BASE}/img/P001.jpg`,
  sourceName: "POSE & CHARACTER Atlas",
  sourceUrl: `${BASE}/`,
};

const depthItem: CloudReferenceItem = {
  id: "depth-full_sexy_P001_front",
  kind: "depth",
  title: "S字立ち・腰を横に突き出す · 正面",
  category: "立ち",
  tags: ["深度"],
  thumbUrl: "https://ai-pose-depth-gallery.pages.dev/thumbs/full_sexy_P001_front.jpg",
  imageUrl: "https://ai-pose-depth-gallery.pages.dev/img/full_sexy_P001_front.png",
  sourceName: "depth ポーズ集 POSE-DB-02",
  sourceUrl: "https://ai-pose-depth-gallery.pages.dev/",
};

const catalog: CloudReferenceCatalog = {
  sourceName: "POSE & CHARACTER Atlas",
  sourceUrl: `${BASE}/`,
  attribution: "测试用云端参考库",
  fetchedAt: "2026-11-02T00:00:00.000Z",
  counts: {
    portrait: 0,
    costume: 0,
    hair: 0,
    pose: 1,
    depth: 1,
    "anime-costume": 0,
    normal: 0,
  },
  items: [poseItem, depthItem],
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
  await screen.findByTitle(/编号 P001/);
};

it("停在「全部」时不显示深度图说明", async () => {
  await openCloudTab();
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});

it("切到深度分类时说明深度图不进参考板，并指出要哪个占位符", async () => {
  await openCloudTab();
  fireEvent.click(screen.getByRole("button", { name: /^深度 \d+$/ }));
  const note = await screen.findByRole("note");
  expect(note).toHaveTextContent("深度图不拼进参考板");
  expect(note).toHaveTextContent("{{depth_image}}");
});

it("切到法线分类时说明法线图走 ControlNet Normal", async () => {
  await openCloudTab();
  fireEvent.click(screen.getByRole("button", { name: /^法线 \d+$/ }));
  const note = await screen.findByRole("note");
  expect(note).toHaveTextContent("法线图不拼进参考板");
  expect(note).toHaveTextContent("{{normal_image}}");
});

it("从深度分类切回全部后说明消失", async () => {
  await openCloudTab();
  fireEvent.click(screen.getByRole("button", { name: /^深度 \d+$/ }));
  await screen.findByRole("note");
  fireEvent.click(screen.getByRole("button", { name: /^全部 \d+$/ }));
  await waitFor(() => expect(screen.queryByRole("note")).not.toBeInTheDocument());
});
