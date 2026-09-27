import { describe, it, expect } from "vitest";
import {
  layoutPresets,
  presetLayout,
  movePanel,
  normalizeLayout,
  libraryDirection,
} from "../src/layout";
describe("停靠布局", () => {
  it("每个预设都完整保留三个辅助模块，拍摄信息处于侧栏", () => {
    for (const p of layoutPresets) {
      expect(Object.values(p.layout.zones).flat().sort()).toEqual([
        "library",
        "metadata",
        "settings",
      ]);
      expect(p.layout.zones.bottom).not.toContain("metadata");
    }
  });
  it("跨区拖动不重复、不丢失，也不改动预设", () => {
    const initial = presetLayout("classic");
    const moved = movePanel(initial, "metadata", "left", "library");
    expect(moved.zones.left).toEqual(["metadata", "library"]);
    expect(moved.zones.right).toEqual(["settings"]);
    expect(initial.zones.left).toEqual(["library"]);
    expect(moved.preset).toBe("custom");
  });
  it("同一区域可以调整顺序，拖到自己保持原样", () => {
    const initial = presetLayout("classic");
    expect(
      movePanel(initial, "settings", "right", "metadata").zones.right,
    ).toEqual(["settings", "metadata"]);
    expect(movePanel(initial, "metadata", "right", "metadata")).toBe(initial);
  });
  it("照片库停靠到底部后键盘改为左右方向", () => {
    expect(libraryDirection(presetLayout("classic"))).toBe("vertical");
    expect(
      libraryDirection(movePanel(presetLayout("classic"), "library", "bottom")),
    ).toBe("horizontal");
  });
  it("损坏的存储布局回退，异常尺寸被约束", () => {
    expect(
      normalizeLayout({
        zones: { left: ["library", "library"], right: [], bottom: [] },
        sizes: {},
      }),
    ).toEqual(presetLayout("classic"));
    const p = presetLayout("filmstrip");
    p.sizes = { left: 9999, right: -20, bottom: NaN };
    expect(normalizeLayout(p).sizes).toEqual({
      left: 460,
      right: 170,
      bottom: 148,
    });
  });
});
