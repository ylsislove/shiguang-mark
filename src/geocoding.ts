import type { Coordinates } from "./model";
export const GEOCODER_URL = "https://photon.komoot.io/reverse";
export function coordinateKey(c?: Coordinates): string {
  if (
    !c ||
    !Number.isFinite(c.latitude) ||
    !Number.isFinite(c.longitude) ||
    Math.abs(c.latitude) > 90 ||
    Math.abs(c.longitude) > 180
  )
    return "";
  return `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`;
}
export function placeFromResponse(value: unknown): string {
  const feature = (
    value as { features?: { properties?: Record<string, unknown> }[] } | null
  )?.features?.[0];
  const p = feature?.properties;
  if (!p || typeof p !== "object") return "";
  const parts = [
    p.state,
    p.city || p.county,
    p.district,
    p.locality,
    p.name || p.street,
  ];
  const names = parts
    .filter((v): v is string => typeof v === "string" && !!v.trim())
    .map((v) => v.trim());
  return (
    [...new Set(names)].join(" · ").slice(0, 120) ||
    (typeof p.country === "string" ? p.country.slice(0, 120) : "")
  );
}
// Interactive requests only; no photograph, EXIF object, or filename is sent.
// Cache stays in memory for this page and is not written to localStorage.
export function createGeocoder(request: typeof fetch = fetch) {
  const cache = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  let tail: Promise<unknown> = Promise.resolve(),
    lastStarted = -Infinity;
  return function lookup(c: Coordinates): Promise<string> {
    const key = coordinateKey(c);
    if (!key) return Promise.reject(new Error("照片坐标无效，无法查询地名。"));
    if (cache.has(key)) return Promise.resolve(cache.get(key)!);
    if (pending.has(key)) return pending.get(key)!;
    const task = tail
      .catch(() => {})
      .then(async () => {
        const wait = Math.max(0, 1100 - (Date.now() - lastStarted));
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        lastStarted = Date.now();
        const [lat, lon] = key.split(",");
        const url = new URL(GEOCODER_URL);
        url.search = new URLSearchParams({ lat, lon, limit: "1" }).toString();
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 12000);
        try {
          const response = await request(url.toString(), {
            signal: abort.signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
            headers: { "Accept-Language": "zh-CN,zh;q=0.9" },
          });
          if (!response.ok)
            throw new Error(
              response.status === 429
                ? "查询频率较高，请稍后重试。"
                : "地名服务暂时不可用，请稍后重试或手动填写。",
            );
          const name = placeFromResponse(await response.json());
          if (!name)
            throw new Error("附近没有可用地名，请手动填写或使用经纬度。");
          if (cache.size >= 256) cache.delete(cache.keys().next().value!);
          cache.set(key, name);
          return name;
        } catch (e) {
          if (abort.signal.aborted)
            throw new Error("地名查询超时，可稍后重试或保留经纬度。");
          if (e instanceof TypeError)
            throw new Error("无法连接地名服务，请检查网络或手动填写。");
          throw e;
        } finally {
          clearTimeout(timeout);
        }
      })
      .finally(() => pending.delete(key));
    pending.set(key, task);
    tail = task;
    return task;
  };
}
export const lookupPlace = createGeocoder();
