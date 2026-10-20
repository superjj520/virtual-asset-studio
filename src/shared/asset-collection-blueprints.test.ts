import { expect, it } from "vitest";
import { collectUsableReferenceAssetIds } from "./asset-collection-blueprints";

it("从资产包模块中提取可复用的已确认图片，并按模块归档顺序去重", () => {
  const details = [{
    assets: [
      { id: "late", type: "image", mediaType: "image/png", confirmation: "confirmed", rightsStatus: "authorized", sortOrder: 4 },
      { id: "early", type: "reference_image", mediaType: "image/png", confirmation: "confirmed", rightsStatus: "original", sortOrder: 1 },
      { id: "draft", type: "image", mediaType: "image/png", confirmation: "draft", rightsStatus: "authorized", sortOrder: 0 },
      { id: "audio", type: "audio", mediaType: "audio/mpeg", confirmation: "confirmed", rightsStatus: "authorized", sortOrder: 0 },
    ],
  }, { assets: [{ id: "early", type: "image", mediaType: "image/png", confirmation: "confirmed", rightsStatus: "authorized", sortOrder: 2 }] }];
  expect(collectUsableReferenceAssetIds(details as never)).toEqual(["early", "late"]);
});
