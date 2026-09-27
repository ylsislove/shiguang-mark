import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  Camera,
  FolderOpen,
  ImagePlus,
  ShieldCheck,
  Sparkles,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Trash2,
  Eye,
  RotateCcw,
  Check,
  Loader2,
  X,
  Info,
  MapPin,
  Calendar,
  SlidersHorizontal,
  ExternalLink,
} from "lucide-react";
import { zipSync } from "fflate";
import {
  defaults,
  templates,
  loadSettings,
  exportName,
  watermarkLines,
  photoMetadata,
  attachMetadataReference,
  photoPlace,
  resolvedPhotoPlace,
  applyResolvedPlace,
  type Settings,
  type Photo,
  type Corner,
  type Template,
} from "./model";
import {
  readPhoto,
  readMetadata,
  isMetadataPhoto,
  isPhoto,
  droppedFiles,
  folderFiles,
  type PickerWindow,
} from "./photos";
import { renderPhoto, exportPhoto } from "./render";
import { DockWorkspace, LayoutPicker } from "./DockWorkspace";
import { loadLayout, libraryDirection } from "./layout";
import { coordinateKey, lookupPlace } from "./geocoding";
interface DownloadItem {
  url: string;
  name: string;
  size: number;
}
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]),
    [index, setIndex] = useState(0),
    [settings, setSettings] = useState<Settings>(loadSettings);
  const [workspaceLayout, setWorkspaceLayout] = useState(loadLayout);
  const layout = libraryDirection(workspaceLayout);
  const [geocoding, setGeocoding] = useState<string | null>(null);
  const [geoErrors, setGeoErrors] = useState<
    Record<string, { key: string; message: string }>
  >({});
  const [importing, setImporting] = useState(""),
    [progress, setProgress] = useState(""),
    [dragging, setDragging] = useState(false),
    [original, setOriginal] = useState(false),
    [rendering, setRendering] = useState(false),
    [previewError, setPreviewError] = useState("");
  const [messages, setMessages] = useState<string[]>([]),
    [downloads, setDownloads] = useState<DownloadItem[]>([]),
    [showInfo, setShowInfo] = useState(false),
    [notice, setNotice] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null),
    originalInput = useRef<HTMLInputElement>(null),
    originalTarget = useRef<string | null>(null),
    cancel = useRef(false),
    busy = useRef(false),
    allPhotos = useRef<Photo[]>([]),
    allDownloads = useRef<DownloadItem[]>([]),
    dialog = useRef<HTMLDialogElement>(null),
    touchStart = useRef<{ x: number; y: number } | null>(null);
  const current = photos[index];
  const metadata = current ? photoMetadata(current) : undefined;
  const locked = Boolean(importing || progress);
  const lines = current ? watermarkLines(current, settings) : [];
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }
  function move(by: number) {
    setIndex((i) => Math.max(0, Math.min(photos.length - 1, i + by)));
    setOriginal(false);
  }
  useEffect(() => {
    allPhotos.current = photos;
  }, [photos]);
  useEffect(() => {
    allDownloads.current = downloads;
  }, [downloads]);
  useEffect(
    () => () => {
      allPhotos.current.forEach((p) => URL.revokeObjectURL(p.thumb));
      allDownloads.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [],
  );
  useEffect(() => {
    try {
      const { caption, ...safe } = settings;
      localStorage.setItem("shiguang-settings-v1", JSON.stringify(safe));
    } catch {}
  }, [settings]);
  useEffect(() => {
    try {
      localStorage.setItem("shiguang-dock-v2", JSON.stringify(workspaceLayout));
    } catch {}
  }, [workspaceLayout]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          "input,textarea,select,[contenteditable],dialog[open]",
        ) ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        dialog.current?.open
      )
        return;
      const next = layout === "vertical" ? "ArrowDown" : "ArrowRight",
        prev = layout === "vertical" ? "ArrowUp" : "ArrowLeft";
      if (e.key === next || e.key === prev) {
        e.preventDefault();
        setIndex((i) =>
          Math.max(
            0,
            Math.min(photos.length - 1, i + (e.key === next ? 1 : -1)),
          ),
        );
        setOriginal(false);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [layout, photos.length]);
  useEffect(() => {
    document.querySelector(".photo-item.is-active")?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [index, workspaceLayout]);
  useEffect(() => {
    if (!current) {
      setPreviewError("");
      return;
    }
    let stale = false;
    setRendering(true);
    setPreviewError("");
    const timer = window.setTimeout(async () => {
      const off = document.createElement("canvas");
      try {
        await renderPhoto(off, current, settings, 1800, original);
        if (!stale && canvas.current) {
          const c = canvas.current;
          c.width = off.width;
          c.height = off.height;
          c.getContext("2d")!.drawImage(off, 0, 0);
        }
      } catch (e) {
        if (!stale)
          setPreviewError(e instanceof Error ? e.message : "预览失败");
      } finally {
        off.width = 1;
        off.height = 1;
        if (!stale) setRendering(false);
      }
    }, 80);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [current, settings, original]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  async function importFiles(entries: { file: File; path: string }[]) {
    if (busy.current) return;
    busy.current = true;
    const good = entries
      .filter((e) => isPhoto(e.file))
      .sort((a, b) =>
        a.path.localeCompare(b.path, undefined, { numeric: true }),
      );
    const unsupported = entries.length - good.length;
    const errors: string[] = [];
    const added: Photo[] = [];
    const seen = new Set(
      photos.map((p) => `${p.path}|${p.file.size}|${p.file.lastModified}`),
    );
    let duplicates = 0;
    try {
      if (!good.length) {
        setMessages([
          "未找到支持的照片。请选择 JPG、PNG、WebP、AVIF 或浏览器支持的 HEIC/HEIF。",
        ]);
        return;
      }
      for (let i = 0; i < good.length; i++) {
        setImporting(`读取照片 ${i + 1} / ${good.length}`);
        const { file, path } = good[i];
        const key = `${path}|${file.size}|${file.lastModified}`;
        if (seen.has(key)) {
          duplicates++;
          continue;
        }
        try {
          added.push(await readPhoto(file, path));
          seen.add(key);
        } catch (e) {
          errors.push(
            `${path}：${e instanceof Error ? e.message : "无法读取"}`,
          );
        }
      }
      setPhotos((p) => [...p, ...added]);
      if (added.length && !photos.length) setIndex(0);
      if (errors.length) setMessages(errors);
      setNotice(
        `已导入 ${added.length} 张照片${duplicates ? `，跳过 ${duplicates} 张重复照片` : ""}${unsupported ? `，忽略 ${unsupported} 个非照片文件` : ""}`,
      );
    } finally {
      busy.current = false;
      setImporting("");
      if (fileInput.current) fileInput.current.value = "";
      if (folderInput.current) folderInput.current.value = "";
    }
  }
  async function pickFolder() {
    const picker = (window as PickerWindow).showDirectoryPicker;
    if (!picker) {
      folderInput.current?.click();
      return;
    }
    try {
      const h = await picker({ mode: "read", id: "shiguang-import" });
      setImporting("正在检索文件夹…");
      const files = await folderFiles(h);
      setImporting("");
      await importFiles(files);
    } catch (e) {
      setImporting("");
      if ((e as Error).name !== "AbortError") {
        setNotice("文件夹选择不可用，请通过文件夹导入框选择");
        folderInput.current?.click();
      }
    }
  }
  async function onDrop(e: DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(false);
    if (locked) return;
    try {
      const pending = droppedFiles(e.dataTransfer);
      setImporting("正在检索拖入的文件…");
      const files = await pending;
      setImporting("");
      await importFiles(files);
    } catch {
      setImporting("");
      setMessages(["无法读取拖入的文件夹，请使用“选择文件夹”。"]);
    }
  }
  function editPhoto(key: "date" | "place", value: string) {
    if (!current) return;
    setPhotos((p) =>
      p.map((x) =>
        x.id === current.id
          ? {
              ...x,
              [key]: value,
              ...(key === "place" ? { placeMode: "name" as const } : {}),
            }
          : x,
      ),
    );
  }
  function applyToAll() {
    if (!current || !metadata) return;
    setPhotos((p) =>
      p.map((x) => ({
        ...x,
        date: current.date ?? metadata.date,
        place: photoPlace(current),
        placeMode: "name",
      })),
    );
    setNotice(`已将当前日期、地点应用到 ${photos.length} 张照片`);
  }
  async function identifyPlace() {
    if (!current || locked) return;
    const target = current;
    setPhotos((ps) =>
      ps.map((p) => (p.id === target.id ? { ...p, placeMode: "name" } : p)),
    );
    if (resolvedPhotoPlace(target)) return;
    const coords = photoMetadata(target).coordinates;
    if (!coords || geocoding) return;
    const key = coordinateKey(coords);
    setGeocoding(target.id);
    setGeoErrors((errors) => ({
      ...errors,
      [target.id]: { key, message: "" },
    }));
    try {
      const name = await lookupPlace(coords);
      setPhotos((ps) =>
        ps.map((p) =>
          p.id === target.id ? applyResolvedPlace(p, key, name) : p,
        ),
      );
      if (
        allPhotos.current.some(
          (p) =>
            p.id === target.id &&
            coordinateKey(photoMetadata(p).coordinates) === key,
        )
      )
        setNotice("已识别地名，可在输入框中修改");
    } catch (e) {
      setGeoErrors((errors) => ({
        ...errors,
        [target.id]: {
          key,
          message: e instanceof Error ? e.message : "地名识别失败，请重试。",
        },
      }));
    } finally {
      setGeocoding(null);
    }
  }
  function pickOriginal() {
    if (!current || locked) return;
    originalTarget.current = current.id;
    originalInput.current?.click();
  }
  async function supplementOriginal(file?: File) {
    const target = photos.find((p) => p.id === originalTarget.current);
    if (!file || !target || busy.current || locked) return;
    busy.current = true;
    setImporting(`读取原图信息 · ${file.name}`);
    setMessages([]);
    try {
      if (!isMetadataPhoto(file))
        throw new Error(
          "请选择 JPG、PNG、WebP、AVIF、HEIC/HEIF 或 TIFF 原图。",
        );
      const linked = attachMetadataReference(
        target,
        file.name,
        await readMetadata(file),
      );
      setPhotos((ps) =>
        ps.map((p) =>
          p.id === target.id
            ? { ...p, metadataReference: linked.metadataReference }
            : p,
        ),
      );
      setNotice(`已为「${target.file.name}」补充原图信息`);
    } catch (error) {
      setMessages([
        error instanceof Error ? error.message : "原图信息读取失败，请重试。",
      ]);
    } finally {
      busy.current = false;
      setImporting("");
      originalTarget.current = null;
      if (originalInput.current) originalInput.current.value = "";
    }
  }
  function remove(id: string) {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.thumb);
    setPhotos((ps) => ps.filter((x) => x.id !== id));
    setIndex((i) => Math.max(0, Math.min(i, photos.length - 2)));
  }
  function setTemplate(id: Template) {
    setSettings((s) => ({
      ...s,
      template: id,
      ...(id === "camera" ? { showCamera: true, showParams: true } : {}),
      ...(id === "paper"
        ? { corner: s.corner.endsWith("r") ? ("br" as const) : ("bl" as const) }
        : {}),
    }));
  }
  function addDownload(blob: Blob, name: string) {
    const item = { url: URL.createObjectURL(blob), name, size: blob.size };
    setDownloads((d) => [...d, item]);
  }
  async function exportImages(all: boolean) {
    if (!current || locked) return;
    cancel.current = false;
    setMessages([]);
    setProgress("准备导出…");
    const batch = all ? [...photos] : [current];
    const snapshot = { ...settings };
    const errors: string[] = [];
    let archive: Record<string, Uint8Array> = {},
      archiveSize = 0,
      part = 1,
      succeeded = 0;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const flush = () => {
      if (!Object.keys(archive).length) return;
      const zipped = zipSync(archive, { level: 0 });
      addDownload(
        new Blob([zipped as BlobPart], { type: "application/zip" }),
        `时光印_${stamp}_${part++}.zip`,
      );
      archive = {};
      archiveSize = 0;
    };
    try {
      for (let i = 0; i < batch.length; i++) {
        if (cancel.current) break;
        setProgress(
          `正在导出 ${i + 1} / ${batch.length} · ${batch[i].file.name}`,
        );
        await new Promise((r) => setTimeout(r, 0));
        try {
          const blob = await exportPhoto(batch[i], snapshot);
          if (cancel.current) break;
          const name = exportName(
            batch[i].path,
            all ? i : index,
            snapshot.format,
          );
          if (all) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            if (archiveSize + bytes.length > 150 * 1024 * 1024) flush();
            archive[name] = bytes;
            archiveSize += bytes.length;
          } else addDownload(blob, name);
          succeeded++;
        } catch (e) {
          errors.push(
            `${batch[i].path}：${e instanceof Error ? e.message : "导出失败"}`,
          );
        }
      }
      if (all) flush();
      setNotice(
        `${cancel.current ? "已停止，" : ""}生成 ${succeeded} 张水印照片${errors.length ? `，${errors.length} 张失败` : ""}`,
      );
      if (errors.length) setMessages(errors);
      if (succeeded) dialog.current?.showModal();
    } catch (e) {
      setMessages([
        e instanceof Error ? e.message : "导出失败，请减少照片数量重试",
      ]);
    } finally {
      setProgress("");
    }
  }
  const libraryPanel = (
    <aside className="library panel">
      {!photos.length ? (
        <div className="library-empty">你的照片会出现在这里</div>
      ) : (
        <div className="photo-list" aria-label="照片列表">
          {photos.map((p, i) => (
            <div
              className={"photo-row " + (i === index ? "is-active" : "")}
              key={p.id}
            >
              <button
                className={"photo-item " + (i === index ? "is-active" : "")}
                aria-label={`预览 ${p.file.name}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => {
                  setIndex(i);
                  setOriginal(false);
                }}
              >
                <span className="thumb-wrap">
                  <img src={p.thumb} alt="" loading="lazy" />
                  <span className="photo-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
                <span className="photo-caption">
                  <strong title={p.path}>{p.file.name}</strong>
                  <small>
                    {p.width} × {p.height}
                    {!(p.date ?? photoMetadata(p).date) && " · 待补日期"}
                    {p.metadataReference && " · 已补原图"}
                  </small>
                </span>
              </button>
              <button
                className="remove-photo"
                aria-label={`移除 ${p.file.name}`}
                disabled={locked}
                onClick={() => remove(p.id)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="library-tip">
        支持多选、拖入照片与文件夹
        <br />
        <span>目录选择器中可定位本地路径</span>
      </div>
    </aside>
  );
  const previewPanel = (
    <section className="preview-panel panel">
      <div className="preview-toolbar">
        <h2>
          画面预览
          {current && (
            <span className="preview-counter">
              {index + 1} / {photos.length}
            </span>
          )}
        </h2>
        <span className="preview-key-hint">
          {layout === "vertical" ? "↑ ↓" : "← →"} 切换照片
        </span>
      </div>
      {!current ? (
        <div className="empty-stage">
          <span className="empty-icon">
            <ImagePlus size={38} />
          </span>
          <h2>从一张喜欢的照片开始</h2>
          <p>拖放照片到这里，或选择一个相册文件夹</p>
          <button
            className="primary"
            disabled={locked}
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus size={18} /> 选择照片
          </button>
          <small>JPG · PNG · WebP · AVIF · 浏览器支持的 HEIC</small>
        </div>
      ) : (
        <>
          <div
            className="canvas-stage"
            onPointerDown={(e) => {
              touchStart.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={(e) => {
              if (e.pointerType === "mouse" || !touchStart.current) return;
              const dx = e.clientX - touchStart.current.x,
                dy = e.clientY - touchStart.current.y;
              touchStart.current = null;
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy))
                move(dx < 0 ? 1 : -1);
            }}
          >
            <canvas
              ref={canvas}
              aria-label={`${current.file.name} ${original ? "未加水印" : "水印预览"}`}
            />
            {rendering && (
              <span className="render-badge">
                <Loader2 size={13} className="spin" />
                更新预览
              </span>
            )}
            {previewError && (
              <div className="preview-error" role="alert">
                {previewError}
              </div>
            )}
          </div>
          <div className="photo-controls">
            <button
              aria-label="上一张"
              disabled={index === 0}
              onClick={() => move(-1)}
            >
              {layout === "vertical" ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronLeft size={18} />
              )}
            </button>
            <span title={current.path}>{current.file.name}</span>
            <button
              aria-label="下一张"
              disabled={index === photos.length - 1}
              onClick={() => move(1)}
            >
              {layout === "vertical" ? (
                <ChevronDown size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </button>
            <button
              aria-pressed={original}
              className={original ? "compare active" : "compare"}
              onClick={() => setOriginal((o) => !o)}
            >
              <Eye size={15} />
              {original ? "查看水印" : "对比无水印"}
            </button>
          </div>
        </>
      )}
      <div className="preview-footer">
        <span>
          {settings.template === "paper"
            ? "留白相纸会增加底部画布，原图不裁切"
            : "导出保留原图尺寸，预览按屏幕缩放"}
        </span>
        <span>{layout === "vertical" ? "↑ ↓" : "← →"} 切换 · 手机左右滑动</span>
      </div>
    </section>
  );
  const metadataPanel = current ? (
    <section className="metadata-panel panel">
      <div className="module-tools">
        <div className="metadata-actions">
          <button
            className="reference-button"
            disabled={locked}
            onClick={pickOriginal}
          >
            <ImagePlus size={14} />{" "}
            {current.metadataReference ? "更换原图" : "补充原图"}
          </button>
          <button
            className="text-button"
            onClick={() => setShowInfo((v) => !v)}
            aria-expanded={showInfo}
          >
            {showInfo ? "收起详情" : "全部信息"}
          </button>
        </div>
      </div>
      {current.metadataReference && (
        <div className="reference-source">
          <div>
            <span>已关联原图</span>
            <strong title={current.metadataReference.name}>
              {current.metadataReference.name}
            </strong>
            <small>仅提取拍摄信息，导出使用当前精修照片</small>
            {(current.date !== undefined || current.place !== undefined) && (
              <small>
                手填日期、地点仍优先；点“恢复读取值”可采用原图信息。
              </small>
            )}
          </div>
          <button
            className="text-button"
            disabled={locked}
            aria-label="移除关联原图"
            onClick={() => {
              setPhotos((ps) =>
                ps.map((p) =>
                  p.id === current.id
                    ? { ...p, metadataReference: undefined }
                    : p,
                ),
              );
              setNotice("已移除关联，恢复精修照片自带的信息");
            }}
          >
            <X size={14} /> 移除
          </button>
        </div>
      )}
      <div className="metadata-summary">
        <span>
          <Calendar size={15} />
          {metadata!.date
            ? metadata!.date.replace("T", " ")
            : "未读取到拍摄时间"}
        </span>
        <span>
          <Camera size={15} />
          {metadata!.camera || "未读取到相机信息"}
        </span>
        <span>
          <MapPin size={15} />
          {metadata!.place || "未读取到拍摄地点"}
        </span>
      </div>
      {!metadata!.date && (
        <p className="metadata-tip">
          未读取到拍摄时间。可以补充这张照片的原图自动读取，也可以在水印内容中手动填写。
        </p>
      )}
      <div className="metadata-editor">
        <label className="field">
          当前照片的拍摄时间 <span className="field-note">可手动填写</span>
          <input
            aria-label="当前照片的拍摄时间"
            type="datetime-local"
            step="1"
            disabled={!current || locked}
            value={current ? (current.date ?? metadata!.date) : ""}
            onInput={(e) => editPhoto("date", e.currentTarget.value)}
            onChange={(e) => editPhoto("date", e.target.value)}
          />
        </label>
        <label className="field">
          当前照片的地点
          <input
            disabled={!current || locked}
            maxLength={120}
            placeholder="例如：九寨沟 · 五花海"
            value={current ? photoPlace(current) : ""}
            onChange={(e) => editPhoto("place", e.target.value)}
          />
        </label>
        <div className="place-controls">
          <button
            disabled={
              !metadata?.coordinates ||
              locked ||
              (!!geocoding && !resolvedPhotoPlace(current))
            }
            onClick={() => void identifyPlace()}
            aria-pressed={
              current.placeMode !== "coordinates" &&
              !!resolvedPhotoPlace(current)
            }
          >
            {geocoding === current.id ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <MapPin size={14} />
            )}
            {geocoding === current.id
              ? "正在识别…"
              : resolvedPhotoPlace(current)
                ? "显示地名"
                : "识别地名"}
          </button>
          <button
            disabled={!metadata?.gps || locked}
            aria-pressed={current.placeMode === "coordinates"}
            onClick={() =>
              setPhotos((ps) =>
                ps.map((p) =>
                  p.id === current.id ? { ...p, placeMode: "coordinates" } : p,
                ),
              )
            }
          >
            显示经纬度
          </button>
        </div>
        {geoErrors[current.id]?.key === coordinateKey(metadata?.coordinates) &&
          geoErrors[current.id]?.message && (
            <p className="geo-error" role="alert">
              {geoErrors[current.id].message}
            </p>
          )}
        {resolvedPhotoPlace(current) && current.place !== undefined && (
          <button
            className="text-button"
            onClick={() =>
              setPhotos((ps) =>
                ps.map((p) =>
                  p.id === current.id
                    ? { ...p, place: undefined, placeMode: "name" }
                    : p,
                ),
              )
            }
          >
            采用识别地名
          </button>
        )}
        <p className="geo-note">
          {metadata?.coordinates
            ? "识别时会把此照片的坐标发送至 Photon，照片不上传。返回附近地名，可自行修改。"
            : "照片没有 GPS 坐标，可补充原图或手动填写地点。"}{" "}
          <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">
            Photon
          </a>{" "}
          ·{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap 贡献者
          </a>
        </p>
        <div className="field-actions">
          <button
            disabled={!current || locked}
            className="text-button"
            onClick={applyToAll}
          >
            日期、地点应用到全部
          </button>
          <button
            disabled={!current || locked}
            className="text-button"
            onClick={() => {
              if (current)
                setPhotos((ps) =>
                  ps.map((p) =>
                    p.id === current.id
                      ? {
                          ...p,
                          date: undefined,
                          place: undefined,
                          placeMode: "name",
                        }
                      : p,
                  ),
                );
            }}
          >
            恢复读取值
          </button>
        </div>
      </div>
      {showInfo && (
        <div className="metadata-details">
          <dl>
            <dt>文件路径</dt>
            <dd>{current.path}</dd>
            <dt>尺寸 / 大小</dt>
            <dd>
              {current.width} × {current.height} / {mb(current.file.size)}
            </dd>
            <dt>日期来源</dt>
            <dd>
              {metadata!.source}
              {current.metadataReference?.meta.date &&
                ` · ${current.metadataReference.name}`}
            </dd>
            {Object.entries(metadata!.raw).map(([k, v]) => (
              <div className="metadata-row" key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p>
            {current.metadataReference ? "以上原始字段来自关联原图。" : ""}
            原始字段直接来自照片；识别地名时仅查询坐标。
          </p>
        </div>
      )}
    </section>
  ) : (
    <div className="module-empty">
      <Info size={24} />
      <p>选择一张照片，查看拍摄信息。</p>
    </div>
  );
  const settingsPanel = (
    <aside className="settings panel">
      <div className="module-tools settings-tools">
        <button
          className="text-button"
          onClick={() => setSettings({ ...defaults })}
          title="恢复默认水印设置"
        >
          <RotateCcw size={14} />
          重置
        </button>
      </div>
      <div className="setting-section">
        <span className="section-label">01 / 选择模板</span>
        <div className="template-grid">
          {templates.map((t, i) => (
            <button
              className={
                "template " + (settings.template === t.id ? "selected" : "")
              }
              aria-pressed={settings.template === t.id}
              onClick={() => setTemplate(t.id)}
              key={t.id}
              title={t.hint}
            >
              <div className={"template-art art-" + i}>
                <span>{i === 3 ? "50mm · f/1.8" : "2022.02.16"}</span>
                {settings.template === t.id && <Check size={12} />}
              </div>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="setting-section">
        <span className="section-label">02 / 水印内容</span>
        <div className="field-toggles">
          {(
            [
              ["showDate", "日期"],
              ["showPlace", "地点"],
              ["showCamera", "相机"],
              ["showParams", "参数"],
            ] as const
          ).map(([k, label]) => (
            <label className="check-label" key={k}>
              <input
                type="checkbox"
                checked={settings[k]}
                onChange={(e) => change(k, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        <label className="field">
          日期格式
          <select
            value={settings.dateFormat}
            onChange={(e) => change("dateFormat", e.target.value)}
          >
            <option value="dots">2022.02.16</option>
            <option value="iso">2022-02-16</option>
            <option value="cn">2022年2月16日</option>
            <option value="datetime">2022.02.16 09:52</option>
          </select>
        </label>
        <label className="field">
          自定义文字 <span className="field-note">全批次通用</span>
          <input
            maxLength={120}
            placeholder="例如：与你走过的每一程"
            value={settings.caption}
            onChange={(e) => change("caption", e.target.value)}
          />
        </label>
        {current && (
          <div
            className={"content-preview " + (!lines.length ? "missing" : "")}
          >
            <span>实际水印内容</span>
            {lines.length ? (
              lines.map((l, i) => <p key={i}>{l}</p>)
            ) : (
              <p>没有可显示的信息，请补填日期、地点或文字。</p>
            )}
          </div>
        )}
      </div>
      <div className="setting-section">
        <span className="section-label">03 / 位置与样式</span>
        <div className="position-demo" role="group" aria-label="水印位置">
          {(
            [
              ["tl", "左上"],
              ["tr", "右上"],
              ["bl", "左下"],
              ["br", "右下"],
            ] as [Corner, string][]
          ).map(([v, t]) => (
            <button
              disabled={settings.template === "paper" && v.startsWith("t")}
              className={settings.corner === v ? "active" : ""}
              aria-pressed={settings.corner === v}
              key={v}
              onClick={() => change("corner", v)}
            >
              {t}
              {settings.corner === v && <Check size={12} />}
            </button>
          ))}
        </div>
        {settings.template === "paper" && (
          <p className="small-hint">相纸模板固定在底部留白，可选择左右对齐。</p>
        )}
        {(
          [
            ["marginX", "水平边距", 0, 20, 0.5, "%"],
            ["marginY", "垂直边距", 0, 20, 0.5, "%"],
            ["size", "文字大小", 1, 6, 0.1, "%"],
            ["opacity", "不透明度", 10, 100, 1, "%"],
          ] as const
        ).map(([key, label, min, max, step, suffix]) => (
          <label className="range-field" key={key}>
            <span>
              {label}
              <output>
                {settings[key]}
                {suffix}
              </output>
            </span>
            <input
              type="range"
              aria-label={label}
              min={min}
              max={max}
              step={step}
              value={settings[key]}
              disabled={settings.template === "paper" && key === "marginY"}
              onChange={(e) => change(key, Number(e.target.value))}
            />
          </label>
        ))}
        <label className="color-field">
          文字颜色{" "}
          <input
            type="color"
            aria-label="文字颜色"
            disabled={["paper", "film", "glass"].includes(settings.template)}
            value={settings.color}
            onChange={(e) => change("color", e.target.value)}
          />
          <span>
            {["paper", "film", "glass"].includes(settings.template)
              ? "模板配色"
              : settings.color.toUpperCase()}
          </span>
        </label>
      </div>
      <div className="setting-section">
        <span className="section-label">04 / 导出设置</span>
        <div className="export-fields">
          <label className="field">
            文件格式
            <select
              value={settings.format}
              onChange={(e) =>
                change("format", e.target.value as Settings["format"])
              }
            >
              <option value="image/jpeg">JPG</option>
              <option value="image/png">PNG（无损）</option>
              <option value="image/webp">WebP</option>
            </select>
          </label>
          <label className="field">
            质量
            <select
              disabled={settings.format === "image/png"}
              value={settings.quality}
              onChange={(e) => change("quality", Number(e.target.value))}
            >
              <option value={100}>100%</option>
              <option value={95}>95% 推荐</option>
              <option value={85}>85% 小体积</option>
              <option value={75}>75%</option>
            </select>
          </label>
        </div>
        <button
          className="export-single"
          disabled={!current || locked}
          onClick={() => void exportImages(false)}
        >
          <Download size={16} />
          导出当前照片
        </button>
        {downloads.length > 0 && (
          <button
            className="text-button"
            onClick={() => dialog.current?.showModal()}
          >
            查看已生成文件 ({downloads.length})
          </button>
        )}
      </div>
      <div className="note">
        <ShieldCheck size={15} />{" "}
        照片只在本机处理，原文件不会改动。导出文件不携带原始
        EXIF；已显示在水印里的内容会保留。
      </div>
    </aside>
  );
  return (
    <div
      className={"app dock-app library-" + layout}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={onDrop}
    >
      <input
        hidden
        ref={fileInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif"
        onChange={(e) =>
          void importFiles(
            Array.from(e.target.files || []).map((file) => ({
              file,
              path: file.name,
            })),
          )
        }
      />
      <input
        hidden
        ref={folderInput}
        type="file"
        multiple
        {...{ webkitdirectory: "" }}
        onChange={(e) =>
          void importFiles(
            Array.from(e.target.files || []).map((file) => ({
              file,
              path: file.webkitRelativePath || file.name,
            })),
          )
        }
      />
      <input
        hidden
        ref={originalInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/tiff,.heic,.heif,.tif,.tiff"
        onChange={(e) => void supplementOriginal(e.target.files?.[0])}
      />
      <header className="app-toolbar">
        <a className="brand" href="./" aria-label="时光印首页">
          <span className="brand-icon">
            <Camera size={20} />
          </span>
          <h1>
            时光印<span>照片水印工作台</span>
          </h1>
        </a>
        <div className="toolbar-imports">
          <button
            className="import-button"
            disabled={locked}
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus size={16} /> 添加照片
          </button>
          <button disabled={locked} onClick={() => void pickFolder()}>
            <FolderOpen size={16} /> 选择文件夹
          </button>
        </div>
        <LayoutPicker layout={workspaceLayout} onChange={setWorkspaceLayout} />
        <span className="privacy">
          <ShieldCheck size={15} /> 照片本地处理
        </span>
        <a
          className="project-link"
          href="https://github.com/ylsislove/shiguang-mark"
          target="_blank"
          rel="noreferrer"
          aria-label="开源项目"
          title="开源项目"
        >
          <ExternalLink size={16} />
        </a>
        <button
          className="primary toolbar-export"
          disabled={!photos.length || locked}
          onClick={() => void exportImages(true)}
        >
          <Download size={16} /> 批量导出
          {photos.length > 0 && ` (${photos.length})`}
        </button>
      </header>
      {(importing || progress) && (
        <div className="status-banner" role="status">
          <Loader2 className="spin" size={17} />
          <span>{importing || progress}</span>
          {progress && (
            <button
              onClick={() => {
                cancel.current = true;
                setProgress("正在停止，请稍候…");
              }}
            >
              停止导出
            </button>
          )}
        </div>
      )}
      {messages.length > 0 && (
        <div className="error-banner" role="alert">
          <div>
            {messages.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </div>
          <button aria-label="关闭提示" onClick={() => setMessages([])}>
            <X size={16} />
          </button>
        </div>
      )}
      <>
        <DockWorkspace
          layout={workspaceLayout}
          onChange={setWorkspaceLayout}
          panels={{
            library: libraryPanel,
            metadata: metadataPanel,
            settings: settingsPanel,
          }}
          preview={previewPanel}
          photoCount={photos.length}
        />
      </>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <ImagePlus size={50} />
          <h2>松开，导入照片</h2>
          <p>照片与文件夹都可以</p>
        </div>
      )}
      <dialog ref={dialog} className="download-dialog">
        <div className="dialog-heading">
          <div>
            <h2>照片已准备好</h2>
            <p>点击保存到设备，原照片保持不变。</p>
          </div>
          <button
            onClick={() => dialog.current?.close()}
            aria-label="关闭下载窗口"
          >
            <X size={18} />
          </button>
        </div>
        <div className="download-list">
          {downloads.map((d, i) => (
            <a key={d.url} href={d.url} download={d.name}>
              <span className="download-icon">
                <Download size={21} />
              </span>
              <span>
                <strong>{d.name}</strong>
                <small>{mb(d.size)}</small>
              </span>
              <span className="save-label">保存</span>
            </a>
          ))}
        </div>
        <p className="small-hint">
          大批次会自动拆分 ZIP；刷新页面后需重新生成。手机可保存到“文件”。
        </p>
        <button className="primary" onClick={() => dialog.current?.close()}>
          继续编辑
        </button>
      </dialog>
    </div>
  );
}
