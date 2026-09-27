import { describe, it, expect, vi, afterEach } from "vitest";
import {
  layoutPresets,
  presetLayout,
  movePanel,
  normalizeLayout,
  libraryDirection,
  dockPanel,
  findPanel,
  selectTab,
  shiftPanel,
  dropMode,
  loadLayout,
  dockZones,
  panelIds,
  type DockLayout,
  type DockTarget,
} from "../src/layout";
const contents = (p: DockLayout) =>
  Object.values(p.zones).flatMap((groups) => groups.flatMap((g) => g.tabs));
function valid(p: DockLayout) {
  expect(contents(p).sort()).toEqual([...panelIds].sort());
  const groups = Object.values(p.zones).flat();
  expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
  groups.forEach((g) => {
    expect(g.tabs.length).toBeGreaterThan(0);
    expect(g.tabs).toContain(g.active);
  });
  expect(normalizeLayout(p)).toEqual(p);
}
afterEach(() => vi.unstubAllGlobals());
describe("停靠分区和标签组", () => {
  it("所有预设都完整保留模块，拍摄信息在侧栏", () => {
    for (const p of layoutPresets) {
      valid(p.layout);
      expect(findPanel(p.layout, "metadata").zone).not.toBe("bottom");
    }
  });
  it("中心合并标签会移除空分区并选中新标签", () => {
    const initial = presetLayout("classic");
    const result = dockPanel(initial, "metadata", {
      zone: "right",
      groupId: findPanel(initial, "settings").group.id,
      mode: "tab",
    });
    expect(result.zones.right).toHaveLength(1);
    expect(result.zones.right[0].tabs).toEqual(["settings", "metadata"]);
    expect(result.zones.right[0].active).toBe("metadata");
    expect(initial.zones.right).toHaveLength(2);
    valid(result);
  });
  it("合并组三个模块后能单独拖出，源组自动选择剩余标签", () => {
    let p = presetLayout("tabbed");
    p = dockPanel(p, "library", {
      zone: "right",
      groupId: p.zones.right[0].id,
      mode: "tab",
    });
    expect(p.zones.left).toEqual([]);
    expect(p.zones.right[0].tabs).toEqual(["metadata", "settings", "library"]);
    p = movePanel(p, "library", "bottom");
    expect(p.zones.right[0].active).toBe("metadata");
    expect(libraryDirection(p)).toBe("horizontal");
    valid(p);
  });
  it("标签拖到自己的上下边缘可拆分，单独模块拖到自己无效", () => {
    for (const mode of ["before", "after"] as const) {
      const initial = presetLayout("tabbed");
      const p = dockPanel(initial, "settings", {
        zone: "right",
        groupId: initial.zones.right[0].id,
        mode,
      });
      expect(p.zones.right.map((g) => g.tabs[0])).toEqual(
        mode === "before" ? ["settings", "metadata"] : ["metadata", "settings"],
      );
      valid(p);
      const own = findPanel(p, "settings");
      expect(
        dockPanel(p, "settings", {
          zone: own.zone,
          groupId: own.group.id,
          mode,
        }),
      ).toBe(p);
    }
  });
  it("跨区拆分、前后插入不会重用仍存在的组ID", () => {
    let p = presetLayout("classic");
    p = dockPanel(p, "settings", {
      zone: "right",
      groupId: findPanel(p, "metadata").group.id,
      mode: "tab",
    });
    p = movePanel(p, "metadata", "left", "library");
    expect(p.zones.left.map((g) => g.tabs[0])).toEqual(["metadata", "library"]);
    valid(p);
  });
  it("切换活动标签与调整标签顺序保留组合，分区也可调整顺序", () => {
    const p = presetLayout("tabbed");
    const selected = selectTab(p, "metadata");
    expect(selected.zones.right[0].active).toBe("metadata");
    expect(shiftPanel(selected, "metadata", 1).zones.right[0].tabs).toEqual([
      "settings",
      "metadata",
    ]);
    expect(
      shiftPanel(presetLayout("classic"), "settings", -1).zones.right.map(
        (g) => g.active,
      ),
    ).toEqual(["settings", "metadata"]);
    expect(selectTab(selected, "metadata")).toBe(selected);
  });
  it("旧布局无损迁移，新的标签组和活动标签可恢复", () => {
    const old = {
      preset: "custom",
      zones: { left: ["metadata", "library"], right: ["settings"], bottom: [] },
      sizes: { left: 268, right: 310, bottom: 148 },
    };
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "shiguang-dock-v1" ? JSON.stringify(old) : null,
    });
    const migrated = loadLayout();
    expect(migrated.zones.left.map((g) => g.active)).toEqual([
      "metadata",
      "library",
    ]);
    expect(migrated.sizes.left).toBe(268);
    valid(migrated);
    const tabbed = selectTab(presetLayout("tabbed"), "metadata");
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "shiguang-dock-v2"
          ? JSON.stringify(tabbed)
          : JSON.stringify(old),
    });
    expect(loadLayout()).toEqual(tabbed);
  });
  it("损坏布局回退，错误活动标签和尺寸被修复", () => {
    expect(
      normalizeLayout({
        zones: { left: ["library", "library"], right: [], bottom: [] },
        sizes: {},
      }),
    ).toEqual(presetLayout("classic"));
    const p = presetLayout("tabbed");
    p.sizes = { left: 9999, right: -20, bottom: NaN };
    p.zones.right[0].active = "library";
    const normalized = normalizeLayout(p);
    expect(normalized.sizes).toEqual({ left: 460, right: 170, bottom: 148 });
    expect(normalized.zones.right[0].active).toBe("metadata");
    valid(normalized);
  });
  it("落点中间合并、边缘分区，短区域也保留中心目标", () => {
    expect([dropMode(20, 600), dropMode(300, 600), dropMode(580, 600)]).toEqual(
      ["before", "tab", "after"],
    );
    expect([dropMode(3, 80), dropMode(40, 80), dropMode(77, 80)]).toEqual([
      "before",
      "tab",
      "after",
    ]);
  });
  it("对所有预设和二次移动穷举，任何合并拆分都不丢失模块", () => {
    function nextStates(p: DockLayout) {
      const targets: DockTarget[] = dockZones.flatMap((zone) => [
        { zone, mode: "append" as const },
        ...p.zones[zone].flatMap((g) =>
          (["before", "tab", "after"] as const).map((mode) => ({
            zone,
            groupId: g.id,
            mode,
          })),
        ),
      ]);
      return panelIds.flatMap((id) =>
        targets.map((target) => dockPanel(p, id, target)),
      );
    }
    for (const preset of layoutPresets)
      for (const first of nextStates(preset.layout)) {
        valid(first);
        for (const second of nextStates(first)) valid(second);
      }
  });
});
