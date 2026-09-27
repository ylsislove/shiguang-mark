import exifr from "exifr";
import { metadataFromTags, type Photo } from "./model";
export const isPhoto = (f: File) =>
  /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(f.name);
export async function decode(
  file: File,
): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  try {
    const b = await createImageBitmap(file);
    return {
      image: b,
      width: b.width,
      height: b.height,
      close: () => b.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      return {
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("浏览器无法解码此图片，请转为 JPG 或 PNG");
    }
  }
}
export function canvasBlob(
  c: HTMLCanvasElement,
  type = "image/jpeg",
  quality = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("图片导出失败，可能超出设备内存限制")),
      type,
      quality,
    ),
  );
}
export async function readPhoto(
  file: File,
  path = file.webkitRelativePath || file.name,
): Promise<Photo> {
  const d = await decode(file);
  let thumb = "";
  try {
    if (d.width > 16384 || d.height > 16384 || d.width * d.height > 64000000)
      throw new Error("图片超过 6400 万像素或单边 16384 像素，请先缩小");
    const c = document.createElement("canvas");
    const sc = Math.min(1, 240 / Math.max(d.width, d.height));
    c.width = Math.round(d.width * sc);
    c.height = Math.round(d.height * sc);
    c.getContext("2d")!.drawImage(d.image, 0, 0, c.width, c.height);
    thumb = URL.createObjectURL(await canvasBlob(c, "image/jpeg", 0.8));
    let tags = {};
    try {
      tags =
        (await exifr.parse(file, {
          tiff: true,
          exif: true,
          gps: true,
          iptc: true,
          xmp: true,
          reviveValues: false,
          translateValues: true,
        })) || {};
    } catch {
      /* A decodable photo remains usable even without readable metadata. */
    }
    return {
      id: crypto.randomUUID(),
      file,
      path,
      thumb,
      width: d.width,
      height: d.height,
      meta: metadataFromTags(tags),
    };
  } finally {
    d.close();
  }
}
interface Entry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, fail: (e: Error) => void) => void;
  createReader?: () => {
    readEntries: (ok: (e: Entry[]) => void, fail: (e: Error) => void) => void;
  };
}
async function walk(
  e: Entry,
  prefix = "",
): Promise<{ file: File; path: string }[]> {
  if (e.isFile) {
    const file = await new Promise<File>((ok, fail) => e.file!(ok, fail));
    return [{ file, path: prefix + e.name }];
  }
  const r = e.createReader!();
  const out: { file: File; path: string }[] = [];
  while (true) {
    const batch = await new Promise<Entry[]>((ok, fail) =>
      r.readEntries(ok, fail),
    );
    if (!batch.length) break;
    for (const child of batch)
      out.push(...(await walk(child, prefix + e.name + "/")));
  }
  return out;
}
export async function droppedFiles(dt: DataTransfer) {
  const entries = Array.from(dt.items)
    .map((i) => i.webkitGetAsEntry?.())
    .filter(Boolean) as unknown as Entry[];
  if (entries.length) {
    const out: { file: File; path: string }[] = [];
    for (const e of entries) out.push(...(await walk(e)));
    return out;
  }
  return Array.from(dt.files).map((file) => ({ file, path: file.name }));
}
export interface DirectoryHandle {
  name: string;
  kind: string;
  values: () => AsyncIterable<
    DirectoryHandle & { getFile: () => Promise<File> }
  >;
  getFileHandle: (
    name: string,
    o: { create: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (b: Blob) => Promise<void>;
      close: () => Promise<void>;
      abort: () => Promise<void>;
    }>;
  }>;
}
export type PickerWindow = Window & {
  showDirectoryPicker?: (options: {
    mode: "read" | "readwrite";
    id: string;
  }) => Promise<DirectoryHandle>;
};
export async function folderFiles(
  h: DirectoryHandle,
  prefix = "",
): Promise<{ file: File; path: string }[]> {
  const out: { file: File; path: string }[] = [];
  for await (const entry of h.values()) {
    if (entry.kind === "directory")
      out.push(...(await folderFiles(entry, prefix + h.name + "/")));
    else {
      const file = await entry.getFile();
      if (isPhoto(file))
        out.push({ file, path: prefix + h.name + "/" + file.name });
    }
  }
  return out;
}
