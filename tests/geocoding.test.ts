import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coordinateKey,
  createGeocoder,
  placeFromResponse,
} from "../src/geocoding";
import {
  applyResolvedPlace,
  attachMetadataReference,
  metadataFromTags,
  photoMetadata,
  photoPlace,
  resolvedPhotoPlace,
  watermarkLines,
  defaults,
  type Photo,
} from "../src/model";
const point = { latitude: 39.9163, longitude: 116.3972 };
const payload = {
  features: [
    {
      properties: {
        state: "北京市",
        city: "北京市",
        district: "东城区",
        name: "景山公园",
      },
    },
  ],
};
const photo = (): Photo => ({
  id: "a",
  file: new File(["pixels"], "edited.jpg"),
  path: "edited.jpg",
  thumb: "blob:x",
  width: 100,
  height: 100,
  meta: metadataFromTags(point),
});
afterEach(() => vi.useRealTimers());
describe("地名识别与坐标切换", () => {
  it("提取坐标和地名层级，去重并拒绝无效坐标", () => {
    expect(photoMetadata(photo()).coordinates).toEqual(point);
    expect(coordinateKey({ latitude: 100, longitude: 0 })).toBe("");
    expect(placeFromResponse(payload)).toBe("北京市 · 东城区 · 景山公园");
    expect(placeFromResponse({ features: [] })).toBe("");
  });
  it("识别地名默认用于输入和水印，可往返切换而保留手填文字", () => {
    const p = applyResolvedPlace(
      photo(),
      coordinateKey(point),
      "北京市 · 景山公园",
    );
    expect(photoPlace(p)).toBe("北京市 · 景山公园");
    expect(watermarkLines(p, defaults)).toEqual(["北京市 · 景山公园"]);
    const edited = { ...p, place: "我们的北京之行" };
    expect(photoPlace({ ...edited, placeMode: "coordinates" })).toBe(
      p.meta.gps,
    );
    expect(photoPlace({ ...edited, placeMode: "name" })).toBe("我们的北京之行");
    expect(photoPlace({ ...edited, place: "" })).toBe("");
  });
  it("原图换成另一处坐标后丢弃旧地名和过期异步结果", () => {
    const p = applyResolvedPlace(photo(), coordinateKey(point), "旧地点");
    const changed = attachMetadataReference(
      p,
      "new.jpg",
      metadataFromTags({ latitude: 31.2, longitude: 121.5 }),
    );
    expect(resolvedPhotoPlace(changed)).toBe("");
    expect(
      applyResolvedPlace(changed, coordinateKey(point), "晚到的旧结果"),
    ).toBe(changed);
    expect(photoPlace(changed)).toBe(photoMetadata(changed).gps);
  });
  it("相同坐标合并请求并复用结果，只发送坐标与结果数量", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload)));
    const lookup = createGeocoder(request);
    const a = lookup(point),
      b = lookup(point);
    expect(a).toBe(b);
    expect(await a).toBe("北京市 · 东城区 · 景山公园");
    expect(await lookup(point)).toBe(await a);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(new URL(url).hostname).toBe("photon.komoot.io");
    expect([...new URL(url).searchParams.keys()].sort()).toEqual([
      "lat",
      "limit",
      "lon",
    ]);
    expect(options.credentials).toBe("omit");
    expect(options.referrerPolicy).toBe("no-referrer");
  });
  it("不同坐标串行限速，失败后可以重试", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(payload))),
      );
    const lookup = createGeocoder(request);
    const rejected = expect(lookup(point)).rejects.toThrow("频率");
    await vi.advanceTimersByTimeAsync(0);
    await rejected;
    const retry = lookup(point);
    await vi.advanceTimersByTimeAsync(1099);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await retry).toContain("景山公园");
    const next = lookup({ ...point, latitude: 40 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(await next).toContain("景山公园");
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("超时中止请求并返回可操作的提示", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url, options) =>
        new Promise<Response>((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    const lookup = createGeocoder(request as typeof fetch);
    const result = expect(lookup(point)).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(12000);
    await result;
  });
  it("无结果和断网不会写入伪造地点", async () => {
    const empty = createGeocoder(
      vi.fn().mockResolvedValue(new Response('{"features":[]}')),
    );
    await expect(empty(point)).rejects.toThrow("没有可用地名");
    const offline = createGeocoder(
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    await expect(offline(point)).rejects.toThrow("无法连接");
  });
});
