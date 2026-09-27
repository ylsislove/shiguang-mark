import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
} from "react";
import {
  GripVertical,
  PanelsTopLeft,
  X,
  Move,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  layoutPresets,
  panelIds,
  panelNames,
  zoneNames,
  presetLayout,
  movePanel,
  normalizeLayout,
  type DockLayout,
  type DockZone,
  type PanelId,
} from "./layout";

interface LayoutProps {
  layout: DockLayout;
  onChange: (value: DockLayout) => void;
}
export function LayoutPicker({ layout, onChange }: LayoutProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className="layout-picker"
        onClick={() => dialog.current?.showModal()}
      >
        <PanelsTopLeft size={16} />
        {layoutPresets.find((p) => p.id === layout.preset)?.name ||
          "自定义布局"}
      </button>
      <dialog className="layout-dialog" ref={dialog}>
        <div className="dialog-heading">
          <div>
            <h2>安排你的工作台</h2>
            <p>先选一个顺手的布局，再拖动模块标题栏微调。</p>
          </div>
          <button
            aria-label="关闭布局设置"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <div className="layout-presets">
          {layoutPresets.map((p) => (
            <button
              key={p.id}
              className={layout.preset === p.id ? "selected" : ""}
              onClick={() => onChange(presetLayout(p.id))}
              aria-pressed={layout.preset === p.id}
            >
              <span className={"layout-mini mini-" + p.id} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <strong>{p.name}</strong>
              <small>{p.hint}</small>
            </button>
          ))}
        </div>
        <div className="layout-position-list">
          {panelIds.map((id) => {
            const zone = (Object.keys(layout.zones) as DockZone[]).find((z) =>
              layout.zones[z].includes(id),
            )!;
            const index = layout.zones[zone].indexOf(id);
            return (
              <div key={id}>
                <span>{panelNames[id]}</span>
                <select
                  aria-label={`${panelNames[id]}停靠位置`}
                  value={zone}
                  onChange={(e) =>
                    onChange(movePanel(layout, id, e.target.value as DockZone))
                  }
                >
                  {Object.entries(zoneNames).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={`${panelNames[id]}前移`}
                  disabled={index === 0}
                  onClick={() =>
                    onChange(
                      movePanel(
                        layout,
                        id,
                        zone,
                        layout.zones[zone][index - 1],
                      ),
                    )
                  }
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label={`${panelNames[id]}后移`}
                  disabled={index === layout.zones[zone].length - 1}
                  onClick={() =>
                    onChange(
                      movePanel(
                        layout,
                        layout.zones[zone][index + 1],
                        zone,
                        id,
                      ),
                    )
                  }
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="small-hint">
          桌面可拖动模块停靠到左侧、右侧或底部；拖动区域边缘可调宽高。照片库在底部时用
          ← →，在两侧时用 ↑ ↓。手机按预览优先排列。
        </p>
        <button className="primary" onClick={() => dialog.current?.close()}>
          完成
        </button>
      </dialog>
    </>
  );
}
export function DockWorkspace({
  layout,
  onChange,
  panels,
  preview,
  photoCount,
}: LayoutProps & {
  panels: Record<PanelId, ReactNode>;
  preview: ReactNode;
  photoCount: number;
}) {
  const [dragged, setDragged] = useState<PanelId | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moving, setMoving] = useState<PanelId>("library");
  const dialog = useRef<HTMLDialogElement>(null);
  const resize = useRef<{
    zone: DockZone;
    x: number;
    y: number;
    layout: DockLayout;
  } | null>(null);
  const zones = ["left", "right", "bottom"] as const;
  const drag = useRef<{
    id: PanelId;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  function clearDrag() {
    drag.current = null;
    setDragged(null);
    setOver(null);
  }
  useEffect(() => {
    if (!dragged) return;
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearDrag();
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [dragged]);
  function hitTarget(x: number, y: number) {
    const el = document.elementFromPoint(x, y);
    const panel = el?.closest<HTMLElement>("[data-panel]");
    const zone = el?.closest<HTMLElement>("[data-drop-zone]");
    if (!zone) return null;
    return {
      zone: zone.dataset.dropZone as DockZone,
      before: panel?.dataset.panel as PanelId | undefined,
    };
  }
  function beginDrag(e: PointerEvent, id: PanelId) {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, x: e.clientX, y: e.clientY, active: false };
  }
  function draggingPanel(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.active = true;
    setDragged(d.id);
    const hit = hitTarget(e.clientX, e.clientY);
    setOver(hit ? hit.before || hit.zone : null);
  }
  function finishDrag(e: PointerEvent) {
    const d = drag.current;
    if (d?.active) {
      const hit = hitTarget(e.clientX, e.clientY);
      if (hit) onChange(movePanel(layout, d.id, hit.zone, hit.before));
    }
    clearDrag();
  }
  function beginResize(e: PointerEvent, zone: DockZone) {
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = {
      zone,
      x: e.clientX,
      y: e.clientY,
      layout: structuredClone(layout),
    };
  }
  function resizing(e: PointerEvent) {
    const r = resize.current;
    if (!r) return;
    const delta =
      r.zone === "bottom"
        ? r.y - e.clientY
        : r.zone === "left"
          ? e.clientX - r.x
          : r.x - e.clientX;
    onChange(
      normalizeLayout({
        ...r.layout,
        preset: "custom",
        sizes: { ...r.layout.sizes, [r.zone]: r.layout.sizes[r.zone] + delta },
      }),
    );
  }
  const style = {
    "--dock-left": layout.zones.left.length ? `${layout.sizes.left}px` : "0px",
    "--dock-right": layout.zones.right.length
      ? `${layout.sizes.right}px`
      : "0px",
    "--dock-bottom": layout.zones.bottom.length
      ? `${layout.sizes.bottom}px`
      : "0px",
  } as CSSProperties;
  return (
    <div
      className={"dock-workspace" + (dragged ? " is-docking" : "")}
      style={style}
    >
      <main className="dock-preview">
        {preview}
        {dragged && (
          <div className="dock-targets">
            {zones.map((zone) => (
              <div
                key={zone}
                className={`dock-target target-${zone} ${over === zone ? "over" : ""}`}
                data-drop-zone={zone}
              >
                <Move size={18} />
                <span>停靠到{zoneNames[zone]}</span>
              </div>
            ))}
          </div>
        )}
      </main>
      {zones.map((zone) => (
        <div
          key={zone}
          className={`dock-zone zone-${zone} ${over === zone ? "over" : ""}`}
          data-empty={!layout.zones[zone].length}
          data-drop-zone={zone}
        >
          {layout.zones[zone].map((id) => (
            <section
              key={id}
              className={`dock-panel dock-${id} ${over === id ? "drop-before" : ""}`}
              data-panel={id}
            >
              <div
                className="dock-heading"
                onPointerDown={(e) => beginDrag(e, id)}
                onPointerMove={draggingPanel}
                onPointerUp={finishDrag}
                onPointerCancel={clearDrag}
              >
                <GripVertical size={15} className="dock-grip" />
                <h2>
                  {panelNames[id]}
                  {id === "library" && (
                    <span className="count">{photoCount}</span>
                  )}
                </h2>
                <button
                  className="dock-move"
                  aria-label={`移动${panelNames[id]}`}
                  title="调整模块位置"
                  onClick={() => {
                    setMoving(id);
                    dialog.current?.showModal();
                  }}
                >
                  <Move size={14} />
                </button>
              </div>
              <div className="dock-body">{panels[id]}</div>
            </section>
          ))}
          {!!layout.zones[zone].length && (
            <div
              className={`dock-resizer resize-${zone}`}
              role="separator"
              aria-label={`调整${zoneNames[zone]}区域大小`}
              aria-orientation={zone === "bottom" ? "horizontal" : "vertical"}
              aria-valuenow={layout.sizes[zone]}
              aria-valuemin={zone === "bottom" ? 112 : 170}
              aria-valuemax={zone === "bottom" ? 340 : 460}
              tabIndex={0}
              onPointerDown={(e) => beginResize(e, zone)}
              onPointerMove={resizing}
              onPointerUp={() => {
                resize.current = null;
              }}
              onPointerCancel={() => {
                resize.current = null;
              }}
              onKeyDown={(e) => {
                const delta =
                  e.key === "ArrowRight" || e.key === "ArrowDown"
                    ? 10
                    : e.key === "ArrowLeft" || e.key === "ArrowUp"
                      ? -10
                      : 0;
                if (!delta) return;
                e.preventDefault();
                e.stopPropagation();
                onChange(
                  normalizeLayout({
                    ...layout,
                    preset: "custom",
                    sizes: {
                      ...layout.sizes,
                      [zone]: layout.sizes[zone] + delta,
                    },
                  }),
                );
              }}
            />
          )}
        </div>
      ))}
      <dialog ref={dialog} className="move-dialog">
        <div className="dialog-heading">
          <h2>移动{panelNames[moving]}</h2>
          <button
            aria-label="关闭模块移动"
            onClick={() => dialog.current?.close()}
          >
            <X size={16} />
          </button>
        </div>
        <div className="move-options">
          {zones.map((zone) => (
            <button
              key={zone}
              onClick={() => {
                onChange(movePanel(layout, moving, zone));
                dialog.current?.close();
              }}
            >
              停靠到{zoneNames[zone]}
            </button>
          ))}
        </div>
        <p className="small-hint">
          也可以直接拖动模块标题栏，到其他模块上方可调整顺序。
        </p>
      </dialog>
    </div>
  );
}
