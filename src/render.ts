import { anchor, watermarkLines, type Photo, type Settings } from "./model";
import { canvasBlob, decode } from "./photos";
export interface RenderInfo {
  width: number;
  height: number;
  lines: string[];
}
export async function renderPhoto(
  canvas: HTMLCanvasElement,
  p: Photo,
  s: Settings,
  maxEdge?: number,
  original = false,
): Promise<RenderInfo> {
  const d = await decode(p.file);
  try {
    const paper = !original && s.template === "paper";
    const fullH =
      d.height + (paper ? Math.round(Math.min(d.width, d.height) * 0.2) : 0);
    const scale = maxEdge ? Math.min(1, maxEdge / Math.max(d.width, fullH)) : 1;
    canvas.width = Math.round(d.width * scale);
    canvas.height = Math.round(fullH * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("此设备无法创建图片画布");
    const w = canvas.width,
      photoH = Math.round(d.height * scale),
      h = canvas.height;
    ctx.fillStyle = paper ? "#faf8f5" : "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(d.image, 0, 0, w, photoH);
    const lines = watermarkLines(p, s);
    if (original || !lines.length)
      return { width: d.width, height: fullH, lines };
    let size = (Math.min(w, photoH) * s.size) / 100;
    const family =
      s.template === "film" || s.template === "camera"
        ? '"Courier New", monospace'
        : '"PingFang SC", "Microsoft YaHei", sans-serif';
    const pad = s.template === "glass" ? size * 0.8 : 0;
    const weights = lines.map((_, i) =>
      i === 0 && s.template === "journal" ? 500 : 400,
    );
    const lineSize = (i: number) => size * (i === 0 ? 1 : 0.68);
    const maxWidth = w * (1 - (2 * s.marginX) / 100) - pad * 2;
    let longest = 0;
    lines.forEach((t, i) => {
      ctx.font = `${weights[i]} ${lineSize(i)}px ${family}`;
      longest = Math.max(longest, ctx.measureText(t).width);
    });
    if (longest > maxWidth) size *= Math.max(0.12, maxWidth / longest);
    const availableHeight = paper
      ? (h - photoH) * 0.8
      : h * (1 - (2 * s.marginY) / 100);
    const estimatedHeight =
      lines.reduce((sum, _, i) => sum + lineSize(i) * 1.45, 0) +
      (s.template === "glass" ? size * 1.6 : 0);
    if (estimatedHeight > availableHeight)
      size *= availableHeight / estimatedHeight;
    const lineHeights = lines.map((_, i) => lineSize(i) * 1.45);
    let bw = 0;
    lines.forEach((t, i) => {
      ctx.font = `${weights[i]} ${lineSize(i)}px ${family}`;
      bw = Math.max(bw, ctx.measureText(t).width);
    });
    const actualPad = s.template === "glass" ? size * 0.8 : 0;
    bw += actualPad * 2;
    const bh = lineHeights.reduce((a, b) => a + b, 0) + actualPad * 2;
    const pos = paper
      ? {
          x: s.corner.endsWith("r")
            ? w - (w * s.marginX) / 100 - bw
            : (w * s.marginX) / 100,
          y: photoH + (h - photoH - bh) / 2,
        }
      : anchor(w, h, bw, bh, s);
    ctx.globalAlpha = s.opacity / 100;
    ctx.textBaseline = "top";
    if (s.template === "glass") {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.roundRect(pos.x, pos.y, bw, bh, size * 0.32);
      ctx.fill();
    }
    if (s.template === "journal") {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.beginPath();
      const ly = Math.max(ctx.lineWidth / 2, pos.y - size * 0.45);
      ctx.moveTo(pos.x, ly);
      ctx.lineTo(pos.x + Math.min(bw, size * 4), ly);
      ctx.stroke();
    }
    if (!paper && s.template !== "glass") {
      ctx.shadowColor = s.template === "film" ? "#7f330baa" : "#00000088";
      ctx.shadowBlur = size * 0.14;
      ctx.shadowOffsetY = size * 0.04;
    }
    ctx.fillStyle = paper
      ? "#4b4444"
      : s.template === "film"
        ? "#ffd19a"
        : s.template === "glass"
          ? "#393042"
          : s.color;
    let y = pos.y + actualPad;
    lines.forEach((t, i) => {
      ctx.font = `${weights[i]} ${lineSize(i)}px ${family}`;
      const lineW = ctx.measureText(t).width;
      const x = s.corner.endsWith("r")
        ? pos.x + bw - actualPad - lineW
        : pos.x + actualPad;
      ctx.fillText(t, x, y);
      y += lineHeights[i];
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    return { width: d.width, height: fullH, lines };
  } finally {
    d.close();
  }
}
export async function exportPhoto(p: Photo, s: Settings) {
  if (!watermarkLines(p, s).length)
    throw new Error("没有可显示的水印内容，请补填日期、地点或文字");
  const c = document.createElement("canvas");
  try {
    await renderPhoto(c, p, s);
    const blob = await canvasBlob(c, s.format, s.quality / 100);
    if (blob.type !== s.format)
      throw new Error("此浏览器不支持所选导出格式，请选择 JPG 或 PNG");
    return blob;
  } finally {
    c.width = 1;
    c.height = 1;
  }
}
