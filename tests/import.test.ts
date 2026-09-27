import { describe, it, expect } from "vitest";
import {
  folderFiles,
  isPhoto,
  readMetadata,
  type DirectoryHandle,
} from "../src/photos";

describe("照片导入集成", () => {
  it("从真实 TIFF EXIF 字节提取当地拍摄日期", async () => {
    const t = new Uint8Array(80),
      v = new DataView(t.buffer);
    t.set([73, 73]);
    v.setUint16(2, 42, true);
    v.setUint32(4, 8, true);
    v.setUint16(8, 1, true);
    v.setUint16(10, 0x8769, true);
    v.setUint16(12, 4, true);
    v.setUint32(14, 1, true);
    v.setUint32(18, 26, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, 0x9003, true);
    v.setUint16(30, 2, true);
    v.setUint32(32, 20, true);
    v.setUint32(36, 44, true);
    t.set(new TextEncoder().encode("2022:02:16 09:52:07\0"), 44);
    const meta = await readMetadata(t);
    expect(meta.date).toBe("2022-02-16T09:52:07");
  });
  it("无法读取的原图返回空信息，不需要解码像素", async () => {
    expect((await readMetadata(new Uint8Array([1, 2, 3]))).date).toBe("");
  });
  it("递归检索文件夹并忽略非照片", async () => {
    const file = (name: string) => ({
      kind: "file",
      name,
      getFile: async () => new File(["fixture"], name),
    });
    const dir = (name: string, children: unknown[]) => ({
      kind: "directory",
      name,
      async *values() {
        yield* children;
      },
    });
    const root = dir("相册", [
      file("a.JPG"),
      file("notes.txt"),
      dir("旅行", [file("b.PNG")]),
    ]);
    const result = await folderFiles(root as DirectoryHandle);
    expect(result.map((x) => x.path)).toEqual([
      "相册/a.JPG",
      "相册/旅行/b.PNG",
    ]);
  });
  it("不把文件名中的图片扩展名片段误认为照片", () => {
    expect(isPhoto(new File([""], "photo.png.exe"))).toBe(false);
    expect(isPhoto(new File([""], "IMG_001.HEIC"))).toBe(true);
  });
});
