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
  title: "站姿 · 编号 P001 · 3 视角",
  category: "全身单人",
  tags: ["站姿", "正面"],
  thumbUrl: `${BASE}/thumbs/P001-正面.jpg`,
  imageUrl: `${BASE}/img/P001-正面.jpg`,
  sourceName: "POSE & CHARACTER Atlas",
  sourceUrl: `${BASE}/`,
  variants: [
    {
      id: "pose-全身单人/P001-正面",
      label: "正面",
      thumbUrl: `${BASE}/thumbs/P001-正面.jpg`,
      imageUrl: `${BASE}/img/P001-正面.jpg`,
    },
    {
      id: "pose-全身单人/P001-侧面",
      label: "侧面",
      thumbUrl: `${BASE}/thumbs/P001-侧面.jpg`,
      imageUrl: `${BASE}/img/P001-侧面.jpg`,
    },
    {
      id: "pose-全身单人/P001-俯视",
      label: "俯视",
      thumbUrl: `${BASE}/thumbs/P001-俯视.jpg`,
      imageUrl: `${BASE}/img/P001-俯视.jpg`,
    },
  ],
};

const catalog: CloudReferenceCatalog = {
  sourceName: "POSE & CHARACTER Atlas",
  sourceUrl: `${BASE}/`,
  attribution: "测试用云端参考库",
  fetchedAt: "2026-11-02T00:00:00.000Z",
  counts: { portrait: 0, costume: 0, hair: 0, pose: 1, depth: 0, "anime-costume": 0,
    normal: 0 },
  items: [poseItem],
};

const importCloud = vi.fn();

beforeEach(() => {
  importCloud.mockReset();
  importCloud.mockResolvedValue({
    id: "asset-pose",
    name: "站姿",
    type: "pose",
    mediaType: "image/png",
    managedPath: "/tmp/asset-pose.png",
    sha256: "asset-pose",
    rightsStatus: "authorized",
    confirmation: "confirmed",
    metadata: {},
    createdAt: "",
    updatedAt: "",
  });
  (window as unknown as { studio: unknown }).studio = {
    referenceLibrary: {
      list: vi.fn().mockResolvedValue(catalog),
      import: importCloud,
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
  await screen.findByRole("group", { name: /站姿.*的视角/ });
};

it("姿势卡片列出全部视角，默认选中正面", async () => {
  await openCloudTab();
  const group = screen.getByRole("group", { name: /站姿.*的视角/ });
  expect(group).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "正面" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "侧面" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "俯视" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "正面" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

it("选择具体视角时引用该视角的原图", async () => {
  await openCloudTab();
  fireEvent.click(screen.getByRole("button", { name: "侧面" }));
  await waitFor(() => expect(importCloud).toHaveBeenCalledTimes(1));
  expect(importCloud.mock.calls[0][0]).toMatchObject({
    id: "pose-全身单人/P001-侧面",
    imageUrl: `${BASE}/img/P001-侧面.jpg`,
    thumbUrl: `${BASE}/thumbs/P001-侧面.jpg`,
  });
  expect(importCloud.mock.calls[0][0].title).toContain("侧面");
});

it("默认点击卡片主体引用正面原图", async () => {
  await openCloudTab();
  fireEvent.click(screen.getByTitle(/站姿.*全身单人/));
  await waitFor(() => expect(importCloud).toHaveBeenCalledTimes(1));
  expect(importCloud.mock.calls[0][0]).toMatchObject({
    id: "pose-全身单人/P001",
    imageUrl: `${BASE}/img/P001-正面.jpg`,
  });
});
