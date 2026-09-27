export type Corner = "tl" | "tr" | "bl" | "br";
export type Template =
  | "minimal"
  | "film"
  | "journal"
  | "camera"
  | "glass"
  | "paper";
export interface Metadata {
  date: string;
  place: string;
  camera: string;
  lens: string;
  params: string;
  gps: string;
  source: string;
  raw: Record<string, string>;
}
export interface Photo {
  id: string;
  file: File;
  path: string;
  thumb: string;
  width: number;
  height: number;
  meta: Metadata;
  date?: string;
  place?: string;
}
export interface Settings {
  template: Template;
  corner: Corner;
  marginX: number;
  marginY: number;
  size: number;
  opacity: number;
  color: string;
  dateFormat: string;
  showDate: boolean;
  showPlace: boolean;
  showCamera: boolean;
  showParams: boolean;
  caption: string;
  format: "image/jpeg" | "image/png" | "image/webp";
  quality: number;
}
export const defaults: Settings = {
  template: "minimal",
  corner: "bl",
  marginX: 5,
  marginY: 5,
  size: 2.5,
  opacity: 95,
  color: "#ffffff",
  dateFormat: "dots",
  showDate: true,
  showPlace: true,
  showCamera: false,
  showParams: false,
  caption: "",
  format: "image/jpeg",
  quality: 95,
};
export const templates: { id: Template; name: string; hint: string }[] = [
  { id: "minimal", name: "时光简记", hint: "轻盈、克制的日期落款" },
  { id: "film", name: "胶片日期", hint: "暖橙色的复古数字印记" },
  { id: "journal", name: "旅行手札", hint: "细线分隔，记下旅行坐标" },
  { id: "camera", name: "相机名片", hint: "清爽紧凑的拍摄信息" },
  { id: "glass", name: "柔光铭牌", hint: "半透明底衬，明暗皆宜" },
  { id: "paper", name: "留白相纸", hint: "底部留白，不覆盖原画面" },
];
export function normalizeDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const m = value.match(
    /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return "";
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const v = new Date(Date.UTC(+y, +mo - 1, +d));
  if (
    +y < 1000 ||
    v.getUTCFullYear() !== +y ||
    v.getUTCMonth() !== +mo - 1 ||
    v.getUTCDate() !== +d ||
    +h > 23 ||
    +mi > 59 ||
    +s > 59
  )
    return "";
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}
export function formatDate(value: string, style: string): string {
  const n = normalizeDate(value);
  if (!n) return "";
  const [d, t] = n.split("T");
  if (style === "datetime") return `${d.replaceAll("-", ".")} ${t.slice(0, 5)}`;
  if (style === "cn")
    return `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
  return style === "iso" ? d : d.replaceAll("-", ".");
}
function str(v: unknown) {
  return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
}
export function metadataFromTags(t: Record<string, unknown> = {}): Metadata {
  const original = normalizeDate(t.DateTimeOriginal);
  const digitized = normalizeDate(t.CreateDate);
  const date = original || digitized;
  const model = str(t.Model),
    make = str(t.Make);
  const camera = model.toLowerCase().startsWith(make.toLowerCase())
    ? model
    : [make, model].filter(Boolean).join(" ");
  const f = Number(t.FNumber),
    ex = Number(t.ExposureTime),
    iso = str(t.ISO),
    focal = Number(t.FocalLength);
  const params = [
    focal > 0 ? `${+focal.toFixed(1)}mm` : "",
    f > 0 ? `f/${+f.toFixed(1)}` : "",
    ex > 0 ? (ex < 1 ? `1/${Math.round(1 / ex)}s` : `${+ex.toFixed(2)}s`) : "",
    iso ? `ISO ${iso}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  const lat = Number(t.latitude),
    lon = Number(t.longitude);
  const gps =
    t.latitude != null &&
    t.longitude != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
      ? `${Math.abs(lat).toFixed(4)}°${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(4)}°${lon < 0 ? "W" : "E"}`
      : "";
  const location = [t.City, t.State, t.Country]
    .map(str)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" · ");
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    if (v == null || v instanceof Uint8Array || v instanceof ArrayBuffer)
      continue;
    let val = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (val && val.length < 500) raw[k] = val;
  }
  return {
    date,
    place: location || gps,
    camera,
    lens: str(t.LensModel),
    params,
    gps,
    source: original
      ? "EXIF 拍摄时间"
      : digitized
        ? "EXIF 数字化时间"
        : "未读取到拍摄时间",
    raw,
  };
}
export function watermarkLines(
  p: Pick<Photo, "meta" | "date" | "place">,
  s: Settings,
): string[] {
  const date = s.showDate
    ? formatDate(p.date ?? p.meta.date, s.dateFormat)
    : "";
  const place = s.showPlace ? (p.place ?? p.meta.place) : "";
  const camera = s.showCamera ? p.meta.camera : "";
  const params = s.showParams ? p.meta.params : "";
  return [date, place, camera, params, s.caption.trim()]
    .filter(Boolean)
    .map((t) => t.slice(0, 180));
}
export function anchor(
  w: number,
  h: number,
  bw: number,
  bh: number,
  s: Pick<Settings, "corner" | "marginX" | "marginY">,
) {
  const mx = (w * s.marginX) / 100,
    my = (h * s.marginY) / 100;
  return {
    x: s.corner.endsWith("r") ? w - mx - bw : mx,
    y: s.corner.startsWith("b") ? h - my - bh : my,
  };
}
export function exportName(
  path: string,
  index: number,
  format: Settings["format"],
) {
  const base = path
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  return `${String(index + 1).padStart(3, "0")}_${base}_时光印.${format === "image/png" ? "png" : format === "image/webp" ? "webp" : "jpg"}`;
}
export function loadSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem("shiguang-settings-v1") || "{}");
    const s = { ...defaults };
    if (templates.some((t) => t.id === v.template)) s.template = v.template;
    if (["tl", "tr", "bl", "br"].includes(v.corner)) s.corner = v.corner;
    for (const k of [
      "marginX",
      "marginY",
      "size",
      "opacity",
      "quality",
    ] as const) {
      const range =
        k === "size"
          ? [1, 6]
          : k === "marginX" || k === "marginY"
            ? [0, 20]
            : k === "quality"
              ? [60, 100]
              : [10, 100];
      if (typeof v[k] === "number" && Number.isFinite(v[k]))
        s[k] = Math.min(range[1], Math.max(range[0], v[k]));
    }
    for (const k of [
      "showDate",
      "showPlace",
      "showCamera",
      "showParams",
    ] as const)
      if (typeof v[k] === "boolean") s[k] = v[k];
    if (/^#[\da-f]{6}$/i.test(v.color)) s.color = v.color;
    if (["dots", "iso", "cn", "datetime"].includes(v.dateFormat))
      s.dateFormat = v.dateFormat;
    if (["image/jpeg", "image/png", "image/webp"].includes(v.format))
      s.format = v.format;
    return s;
  } catch {
    return { ...defaults };
  }
}
