export const panelIds = ["library", "metadata", "settings"] as const;
export type PanelId = (typeof panelIds)[number];
export type DockZone = "left" | "right" | "bottom";
export interface DockLayout {
  preset: string;
  zones: Record<DockZone, PanelId[]>;
  sizes: Record<DockZone, number>;
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
export const layoutPresets: {
  id: string;
  name: string;
  hint: string;
  layout: DockLayout;
}[] = [
  {
    id: "classic",
    name: "经典纵览",
    hint: "左侧照片，右侧信息与设计",
    layout: {
      preset: "classic",
      zones: { left: ["library"], right: ["metadata", "settings"], bottom: [] },
      sizes: { left: 204, right: 326, bottom: 148 },
    },
  },
  {
    id: "filmstrip",
    name: "横向胶片",
    hint: "底部照片，左侧信息，右侧设计",
    layout: {
      preset: "filmstrip",
      zones: { left: ["metadata"], right: ["settings"], bottom: ["library"] },
      sizes: { left: 270, right: 310, bottom: 148 },
    },
  },
  {
    id: "focus",
    name: "宽幅预览",
    hint: "底部照片，信息与设计集中右侧",
    layout: {
      preset: "focus",
      zones: { left: [], right: ["metadata", "settings"], bottom: ["library"] },
      sizes: { left: 250, right: 326, bottom: 148 },
    },
  },
  {
    id: "left",
    name: "左手工作台",
    hint: "左侧信息与设计，右侧照片",
    layout: {
      preset: "left",
      zones: { left: ["metadata", "settings"], right: ["library"], bottom: [] },
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
  const zones = ["left", "right", "bottom"] as const;
  if (zones.some((z) => !Array.isArray(v.zones?.[z])))
    return presetLayout("classic");
  const all = zones.flatMap((z) => v.zones![z]);
  if (
    all.length !== 3 ||
    new Set(all).size !== 3 ||
    panelIds.some((id) => !all.includes(id))
  )
    return presetLayout("classic");
  const sizes = {} as DockLayout["sizes"];
  for (const z of zones) {
    const n = v.sizes[z];
    sizes[z] = Math.max(
      z === "bottom" ? 112 : 170,
      Math.min(
        z === "bottom" ? 340 : 460,
        Number.isFinite(n) ? n : z === "bottom" ? 148 : 290,
      ),
    );
  }
  return {
    preset: typeof v.preset === "string" ? v.preset : "custom",
    zones: structuredClone(v.zones),
    sizes,
  };
}
export function loadLayout(): DockLayout {
  try {
    const saved = localStorage.getItem("shiguang-dock-v1");
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
export function movePanel(
  layout: DockLayout,
  id: PanelId,
  zone: DockZone,
  before?: PanelId,
): DockLayout {
  if (id === before) return layout;
  const next = structuredClone(layout);
  for (const z of Object.keys(next.zones) as DockZone[])
    next.zones[z] = next.zones[z].filter((p) => p !== id);
  const index = before ? next.zones[zone].indexOf(before) : -1;
  next.zones[zone].splice(index < 0 ? next.zones[zone].length : index, 0, id);
  next.preset = "custom";
  return next;
}
export function libraryDirection(layout: DockLayout) {
  return layout.zones.bottom.includes("library") ? "horizontal" : "vertical";
}
