export const panelIds = ["library", "metadata", "settings"] as const;
export type PanelId = (typeof panelIds)[number];
export const dockZones = ["left", "right", "bottom"] as const;
export type DockZone = (typeof dockZones)[number];
export interface DockGroup {
  id: string;
  tabs: PanelId[];
  active: PanelId;
}
export interface DockLayout {
  preset: string;
  zones: Record<DockZone, DockGroup[]>;
  sizes: Record<DockZone, number>;
}
export type DockMode = "append" | "before" | "after" | "tab";
export interface DockTarget {
  zone: DockZone;
  groupId?: string;
  mode: DockMode;
}
export const panelNames: Record<PanelId, string> = {
  library: "照片库",
  metadata: "拍摄信息",
  settings: "水印设计",
};
export const zoneNames: Record<DockZone, string> = {
  left: "左侧",
  right: "右侧",
  bottom: "底部",
};
const single = (id: PanelId): DockGroup => ({
  id: `group-${id}`,
  tabs: [id],
  active: id,
});
export const layoutPresets: {
  id: string;
  name: string;
  hint: string;
  layout: DockLayout;
}[] = [
  {
    id: "classic",
    name: "经典纵览",
    hint: "左侧照片，右侧信息与设计上下分区",
    layout: {
      preset: "classic",
      zones: {
        left: [single("library")],
        right: [single("metadata"), single("settings")],
        bottom: [],
      },
      sizes: { left: 204, right: 326, bottom: 148 },
    },
  },
  {
    id: "tabbed",
    name: "标签工作台",
    hint: "右侧信息与设计合并为标签页",
    layout: {
      preset: "tabbed",
      zones: {
        left: [single("library")],
        right: [
          {
            id: "group-tools",
            tabs: ["metadata", "settings"],
            active: "settings",
          },
        ],
        bottom: [],
      },
      sizes: { left: 204, right: 326, bottom: 148 },
    },
  },
  {
    id: "filmstrip",
    name: "横向胶片",
    hint: "底部照片，左侧信息，右侧设计",
    layout: {
      preset: "filmstrip",
      zones: {
        left: [single("metadata")],
        right: [single("settings")],
        bottom: [single("library")],
      },
      sizes: { left: 270, right: 310, bottom: 148 },
    },
  },
  {
    id: "focus",
    name: "宽幅预览",
    hint: "底部照片，信息与设计集中右侧",
    layout: {
      preset: "focus",
      zones: {
        left: [],
        right: [single("metadata"), single("settings")],
        bottom: [single("library")],
      },
      sizes: { left: 250, right: 326, bottom: 148 },
    },
  },
  {
    id: "left",
    name: "左手工作台",
    hint: "左侧信息与设计，右侧照片",
    layout: {
      preset: "left",
      zones: {
        left: [single("metadata"), single("settings")],
        right: [single("library")],
        bottom: [],
      },
      sizes: { left: 326, right: 204, bottom: 148 },
    },
  },
];
export function presetLayout(id: string): DockLayout {
  return structuredClone(
    (layoutPresets.find((p) => p.id === id) || layoutPresets[0]).layout,
  );
}
export function normalizeLayout(value: unknown): DockLayout {
  const v = value as Partial<DockLayout> | null;
  if (!v?.zones || !v.sizes) return presetLayout("classic");
  const zones = {} as DockLayout["zones"],
    sizes = {} as DockLayout["sizes"];
  const ids = new Set<string>();
  for (const z of dockZones) {
    if (!Array.isArray(v.zones[z])) return presetLayout("classic");
    zones[z] = [];
    for (const [i, raw] of (v.zones[z] as unknown[]).entries()) {
      // Older layouts stored one panel string per region; preserve their order.
      const g =
        typeof raw === "string"
          ? single(raw as PanelId)
          : (raw as DockGroup | null);
      if (
        !g ||
        !Array.isArray(g.tabs) ||
        !g.tabs.length ||
        g.tabs.some((id) => !panelIds.includes(id))
      )
        return presetLayout("classic");
      let id =
        typeof g.id === "string" &&
        /^[a-zA-Z0-9_-]+$/.test(g.id) &&
        !ids.has(g.id)
          ? g.id
          : `group-${z}-${i}`;
      while (ids.has(id)) id += "-new";
      ids.add(id);
      zones[z].push({
        id,
        tabs: [...g.tabs],
        active: g.tabs.includes(g.active) ? g.active : g.tabs[0],
      });
    }
    const n = v.sizes[z];
    sizes[z] = Math.max(
      z === "bottom" ? 112 : 170,
      Math.min(
        z === "bottom" ? 340 : 460,
        Number.isFinite(n) ? n : z === "bottom" ? 148 : 290,
      ),
    );
  }
  const all = dockZones.flatMap((z) => zones[z].flatMap((g) => g.tabs));
  if (
    all.length !== panelIds.length ||
    new Set(all).size !== panelIds.length ||
    panelIds.some((id) => !all.includes(id))
  )
    return presetLayout("classic");
  return {
    preset: typeof v.preset === "string" ? v.preset : "custom",
    zones,
    sizes,
  };
}
export function loadLayout(): DockLayout {
  try {
    const saved =
      localStorage.getItem("shiguang-dock-v2") ||
      localStorage.getItem("shiguang-dock-v1");
    if (saved) return normalizeLayout(JSON.parse(saved));
    return presetLayout(
      localStorage.getItem("shiguang-layout") === "horizontal"
        ? "filmstrip"
        : "classic",
    );
  } catch {
    return presetLayout("classic");
  }
}
export function findPanel(layout: DockLayout, id: PanelId) {
  for (const zone of dockZones) {
    const index = layout.zones[zone].findIndex((g) => g.tabs.includes(id));
    if (index >= 0) return { zone, index, group: layout.zones[zone][index] };
  }
  throw new Error(`Missing panel: ${id}`);
}
export function selectTab(layout: DockLayout, id: PanelId): DockLayout {
  const found = findPanel(layout, id);
  if (found.group.active === id) return layout;
  const next = structuredClone(layout);
  next.zones[found.zone][found.index].active = id;
  return next;
}
export function dockPanel(
  layout: DockLayout,
  id: PanelId,
  target: DockTarget,
): DockLayout {
  const source = findPanel(layout, id);
  const targetGroup = target.groupId
    ? layout.zones[target.zone].find((g) => g.id === target.groupId)
    : undefined;
  if (target.mode !== "append" && !targetGroup) return layout;
  if (targetGroup === source.group) {
    if (target.mode === "tab") return selectTab(layout, id);
    if (source.group.tabs.length === 1) return layout;
  }
  const next = structuredClone(layout);
  const sourceGroup = next.zones[source.zone][source.index];
  sourceGroup.tabs = sourceGroup.tabs.filter((tab) => tab !== id);
  if (sourceGroup.active === id) sourceGroup.active = sourceGroup.tabs[0];
  next.zones[source.zone] = next.zones[source.zone].filter(
    (g) => g.tabs.length,
  );
  const dest = next.zones[target.zone];
  const index = dest.findIndex((g) => g.id === target.groupId);
  if (target.mode === "tab") {
    dest[index].tabs.push(id);
    dest[index].active = id;
  } else {
    const used = new Set(
      dockZones.flatMap((z) => next.zones[z].map((g) => g.id)),
    );
    let groupId = `group-${id}`;
    let suffix = 2;
    while (used.has(groupId)) groupId = `group-${id}-${suffix++}`;
    dest.splice(
      target.mode === "append"
        ? dest.length
        : index + (target.mode === "after" ? 1 : 0),
      0,
      { id: groupId, tabs: [id], active: id },
    );
  }
  next.preset = "custom";
  return next;
}
export function movePanel(
  layout: DockLayout,
  id: PanelId,
  zone: DockZone,
  before?: PanelId,
): DockLayout {
  if (id === before) return layout;
  return dockPanel(layout, id, {
    zone,
    groupId: before ? findPanel(layout, before).group.id : undefined,
    mode: before ? "before" : "append",
  });
}
export function shiftPanel(
  layout: DockLayout,
  id: PanelId,
  by: number,
): DockLayout {
  const found = findPanel(layout, id),
    next = structuredClone(layout);
  const list =
    found.group.tabs.length > 1
      ? next.zones[found.zone][found.index].tabs
      : next.zones[found.zone];
  const index =
    found.group.tabs.length > 1 ? found.group.tabs.indexOf(id) : found.index;
  const dest = index + by;
  if (dest < 0 || dest >= list.length) return layout;
  [list[index], list[dest]] = [list[dest], list[index]];
  next.preset = "custom";
  return next;
}
export function libraryDirection(layout: DockLayout) {
  return findPanel(layout, "library").zone === "bottom"
    ? "horizontal"
    : "vertical";
}
export function dropMode(
  offset: number,
  size: number,
): Exclude<DockMode, "append"> {
  const edge = Math.min(64, size * 0.23);
  return offset < edge ? "before" : offset > size - edge ? "after" : "tab";
}
