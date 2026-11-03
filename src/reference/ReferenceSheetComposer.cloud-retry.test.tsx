import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  CloudReferenceCatalog,
  CloudReferenceItem,
} from "../shared/reference-library";
import { ReferenceSheetComposer } from "./ReferenceSheetComposer";

afterEach(() => cleanup());

const BASE = "https://ai-pose-gallery.anhao.app";

const item: CloudReferenceItem = {
  id: "pose-P001",
  kind: "pose",
  title: "站姿 P001",
  category: "全身单人",
  tags: ["站姿"],
  thumbUrl: `${BASE}/thumbs/P001.jpg`,
  imageUrl: `${BASE}/img/P001.jpg`,
  sourceName: "POSE & CHARACTER Atlas",
  sourceUrl: `${BASE}/`,
};

const catalog: CloudReferenceCatalog = {
  sourceName: "POSE & CHARACTER Atlas",
  sourceUrl: `${BASE}/`,
  attribution: "测试用云端参考库",
  fetchedAt: "2026-11-02T00:00:00.000Z",
  counts: { portrait: 0, costume: 0, hair: 0, pose: 1, depth: 0, "anime-costume": 0,
    normal: 0 },
  items: [item],
};

const openCloudTab = () => {
  render(
    <ReferenceSheetComposer
      assets={[]}
      onClose={() => undefined}
      onUse={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "云端图库" }));
};

it("云端读取失败时给出重试按钮，重试成功后正常列卡片", async () => {
  const list = vi
    .fn()
    .mockRejectedValueOnce(new Error("云端参考库读取失败：网络连接中断"))
    .mockResolvedValueOnce(catalog);
  (window as unknown as { studio: unknown }).studio = {
    referenceLibrary: {
      list,
      import: vi.fn(),
      thumbnail: vi.fn().mockResolvedValue("data:image/webp;base64,AAAA"),
    },
    assets: { preview: vi.fn().mockResolvedValue("") },
    referenceSheets: { compose: vi.fn() },
  };

  openCloudTab();
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("网络连接中断");

  const retry = screen.getByRole("button", { name: "重试" });
  fireEvent.click(retry);

  await waitFor(() => {
    expect(screen.getByText("站姿 P001")).toBeInTheDocument();
  });
  expect(list).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
