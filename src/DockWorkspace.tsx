import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import {
  GripVertical,
  PanelsTopLeft,
  X,
  Move,
  ArrowUp,
  ArrowDown,
  Layers,
} from "lucide-react";
import {
  layoutPresets,
  panelIds,
  panelNames,
  zoneNames,
  dockZones,
  presetLayout,
  movePanel,
  normalizeLayout,
  dockPanel,
  findPanel,
  selectTab,
  shiftPanel,
  dropMode,
  type DockLayout,
  type DockZone,
  type PanelId,
  type DockTarget,
  type DockGroup,
} from "./layout";
interface LayoutProps {
  layout: DockLayout;
  onChange: (value: DockLayout) => void;
}

function PanelPlacement({
  layout,
  onChange,
  id,
}: LayoutProps & { id: PanelId }) {
  const { zone, index, group } = findPanel(layout, id);
  const tabbed = group.tabs.length > 1;
  const position = tabbed ? group.tabs.indexOf(id) : index;
  const length = tabbed ? group.tabs.length : layout.zones[zone].length;
  return (
    <div className="panel-placement">
      <span>{panelNames[id]}</span>
      <select
        aria-label={`${panelNames[id]}停靠位置`}
        value={zone}
        onChange={(e) =>
          onChange(movePanel(layout, id, e.target.value as DockZone))
        }
      >
        {dockZones.map((z) => (
          <option key={z} value={z}>
            {zoneNames[z]}
          </option>
        ))}
      </select>
      <select
        aria-label={`${panelNames[id]}组合方式`}
        value={tabbed ? group.id : "single"}
        onChange={(e) => {
          if (e.target.value === "single")
            onChange(
              dockPanel(layout, id, { zone, groupId: group.id, mode: "after" }),
            );
          else {
            const target = dockZones
              .flatMap((z) => layout.zones[z].map((g) => ({ z, g })))
              .find((x) => x.g.id === e.target.value);
            if (target)
              onChange(
                dockPanel(layout, id, {
                  zone: target.z,
                  groupId: target.g.id,
                  mode: "tab",
                }),
              );
          }
        }}
      >
        <option value="single">独立分区</option>
        {dockZones.flatMap((z) =>
          layout.zones[z]
            .filter((g) => g.tabs.some((tab) => tab !== id))
            .map((g) => (
              <option key={g.id} value={g.id}>
                与
                {g.tabs
                  .filter((tab) => tab !== id)
                  .map((tab) => panelNames[tab])
                  .join(" / ")}
                合并标签
              </option>
            )),
        )}
      </select>
      <button
        aria-label={`${panelNames[id]}前移`}
        disabled={position === 0}
        onClick={() => onChange(shiftPanel(layout, id, -1))}
      >
        <ArrowUp size={14} />
      </button>
      <button
        aria-label={`${panelNames[id]}后移`}
        disabled={position === length - 1}
        onClick={() => onChange(shiftPanel(layout, id, 1))}
      >
        <ArrowDown size={14} />
      </button>
    </div>
  );
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
            <p>拖到模块中间合并标签，拖到边缘拆成分区。</p>
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
          {panelIds.map((id) => (
            <PanelPlacement
              key={id}
              id={id}
              layout={layout}
              onChange={onChange}
            />
          ))}
        </div>
        <p className="small-hint">
          标签可单独拖出。两侧区域支持上下分区，底部区域支持左右分区；拖动区域边缘可调整宽高。布局和选中的标签会自动保存。
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
  const [over, setOver] = useState<DockTarget | null>(null);
  const [moving, setMoving] = useState<PanelId>("library");
  const dialog = useRef<HTMLDialogElement>(null);
  const resize = useRef<{
    zone: DockZone;
    x: number;
    y: number;
    layout: DockLayout;
  } | null>(null);
  const drag = useRef<{
    id: PanelId;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const suppressClickUntil = useRef(0);
  function clearDrag() {
    drag.current = null;
    setDragged(null);
    setOver(null);
  }
  useEffect(() => {
    if (!dragged) return;
    const cancel = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") clearDrag();
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [dragged]);
  function hitTarget(x: number, y: number): DockTarget | null {
    const el = document.elementFromPoint(x, y);
    const zone = el?.closest<HTMLElement>("[data-drop-zone]")?.dataset
      .dropZone as DockZone | undefined;
    if (!zone) return null;
    const group = el?.closest<HTMLElement>("[data-dock-group]");
    if (!group) return { zone, mode: "append" };
    const rect = group.getBoundingClientRect();
    return {
      zone,
      groupId: group.dataset.dockGroup,
      mode: dropMode(
        zone === "bottom" ? x - rect.left : y - rect.top,
        zone === "bottom" ? rect.width : rect.height,
      ),
    };
  }
  function beginDrag(e: PointerEvent, id: PanelId, tab = false) {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    if (e.button !== 0 || (!tab && (e.target as HTMLElement).closest("button")))
      return;
    if (!tab) e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, x: e.clientX, y: e.clientY, active: false };
    suppressClickUntil.current = 0;
  }
  function draggingPanel(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.active = true;
    setDragged(d.id);
    setOver(hitTarget(e.clientX, e.clientY));
  }
  function finishDrag(e: PointerEvent) {
    const d = drag.current;
    if (d?.active) {
      const hit = hitTarget(e.clientX, e.clientY);
      if (hit) onChange(dockPanel(layout, d.id, hit));
      suppressClickUntil.current = Date.now() + 200;
    }
    clearDrag();
  }
  function tabKey(e: KeyboardEvent, group: DockGroup, id: PanelId) {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    e.stopPropagation();
    const index =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? group.tabs.length - 1
          : (group.tabs.indexOf(id) + delta + group.tabs.length) %
            group.tabs.length;
    const next = group.tabs[index];
    onChange(selectTab(layout, next));
    document.getElementById(`dock-tab-${next}`)?.focus();
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
  const activeDropGroup = over?.groupId
    ? layout.zones[over.zone].find((g) => g.id === over.groupId)
    : undefined;
  const dragMessage = over
    ? over.mode === "tab"
      ? `松开：与「${activeDropGroup?.tabs.map((id) => panelNames[id]).join(" / ")}」合并标签`
      : over.mode === "append"
        ? `松开：独立停靠到${zoneNames[over.zone]}`
        : `松开：在${over.zone === "bottom" ? (over.mode === "before" ? "左侧" : "右侧") : over.mode === "before" ? "上方" : "下方"}创建独立分区`
    : "拖到中间合并标签，拖到边缘创建分区";
  return (
    <div
      className={"dock-workspace" + (dragged ? " is-docking" : "")}
      style={style}
    >
      <main className="dock-preview">
        {preview}
        {dragged && (
          <div className="dock-targets">
            {dockZones.map((zone) => (
              <div
                key={zone}
                className={`dock-target target-${zone} ${over?.zone === zone && !over.groupId ? "over" : ""}`}
                data-drop-zone={zone}
              >
                <Move size={18} />
                <span>独立停靠到{zoneNames[zone]}</span>
              </div>
            ))}
          </div>
        )}
      </main>
      {dockZones.map((zone) => (
        <div
          key={zone}
          className={`dock-zone zone-${zone}`}
          data-empty={!layout.zones[zone].length}
          data-drop-zone={zone}
        >
          {layout.zones[zone].map((group) => {
            const tabbed = group.tabs.length > 1;
            const ownSingle =
              group.tabs.length === 1 && group.tabs[0] === dragged;
            return (
              <section
                key={group.id}
                className={`dock-panel dock-group dock-${group.active} ${tabbed ? "is-tab-group" : ""}`}
                data-dock-group={group.id}
                style={
                  {
                    "--group-flex": group.tabs.includes("settings")
                      ? 1.5
                      : group.tabs.includes("metadata")
                        ? 1.05
                        : 1,
                    "--mobile-order": group.tabs.includes("library")
                      ? 1
                      : group.tabs.includes("metadata")
                        ? 2
                        : 3,
                  } as CSSProperties
                }
              >
                {tabbed ? (
                  <div className="dock-heading dock-tab-heading">
                    <div
                      role="tablist"
                      aria-label={`${zoneNames[zone]}模块标签`}
                      className="dock-tabs"
                    >
                      {group.tabs.map((id) => (
                        <button
                          key={id}
                          id={`dock-tab-${id}`}
                          className="dock-tab"
                          role="tab"
                          aria-selected={group.active === id}
                          aria-controls={`dock-content-${id}`}
                          tabIndex={group.active === id ? 0 : -1}
                          onClick={() => {
                            if (Date.now() >= suppressClickUntil.current)
                              onChange(selectTab(layout, id));
                          }}
                          onKeyDown={(e) => tabKey(e, group, id)}
                          onPointerDown={(e) => beginDrag(e, id, true)}
                          onPointerMove={draggingPanel}
                          onPointerUp={finishDrag}
                          onPointerCancel={clearDrag}
                        >
                          <GripVertical size={12} className="tab-grip" />
                          {panelNames[id]}
                          {id === "library" && (
                            <span className="count">{photoCount}</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <button
                      className="dock-move"
                      aria-label={`移动${panelNames[group.active]}`}
                      title="拆分或合并模块"
                      onClick={() => {
                        setMoving(group.active);
                        dialog.current?.showModal();
                      }}
                    >
                      <Move size={14} />
                    </button>
                  </div>
                ) : (
                  <div
                    className="dock-heading"
                    onPointerDown={(e) => beginDrag(e, group.active)}
                    onPointerMove={draggingPanel}
                    onPointerUp={finishDrag}
                    onPointerCancel={clearDrag}
                  >
                    <GripVertical size={15} className="dock-grip" />
                    <h2>
                      {panelNames[group.active]}
                      {group.active === "library" && (
                        <span className="count">{photoCount}</span>
                      )}
                    </h2>
                    <button
                      className="dock-move"
                      aria-label={`移动${panelNames[group.active]}`}
                      title="拆分或合并模块"
                      onClick={() => {
                        setMoving(group.active);
                        dialog.current?.showModal();
                      }}
                    >
                      <Move size={14} />
                    </button>
                  </div>
                )}
                {group.tabs.map((id) => (
                  <div
                    key={id}
                    id={`dock-content-${id}`}
                    data-panel={id}
                    className="dock-body"
                    role={tabbed ? "tabpanel" : undefined}
                    aria-labelledby={tabbed ? `dock-tab-${id}` : undefined}
                    hidden={group.active !== id}
                  >
                    {panels[id]}
                  </div>
                ))}
                {dragged && !ownSingle && (
                  <div
                    className={`group-drop-hints hints-${zone}`}
                    aria-hidden="true"
                  >
                    {(["before", "tab", "after"] as const).map((mode) => (
                      <div
                        key={mode}
                        className={`group-drop-${mode} ${over?.groupId === group.id && over.mode === mode ? "selected" : ""}`}
                      >
                        {mode === "tab" ? (
                          <>
                            <Layers size={19} />
                            <span>合并为标签页</span>
                          </>
                        ) : (
                          <span>
                            {zone === "bottom"
                              ? mode === "before"
                                ? "左侧分区"
                                : "右侧分区"
                              : mode === "before"
                                ? "上方分区"
                                : "下方分区"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
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
      {dragged && (
        <div className="dock-drag-status" role="status">
          {dragMessage}
        </div>
      )}
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
          {dockZones.map((zone) => (
            <button
              key={zone}
              onClick={() => {
                onChange(movePanel(layout, moving, zone));
                dialog.current?.close();
              }}
            >
              独立停靠到{zoneNames[zone]}
            </button>
          ))}
        </div>
        <div className="layout-position-list">
          <PanelPlacement id={moving} layout={layout} onChange={onChange} />
        </div>
        <p className="small-hint">
          拖到模块中间合并标签；拖到上下边缘可分区。拖动单个标签可拆出，也可在此选择“独立分区”。
        </p>
        <button className="primary" onClick={() => dialog.current?.close()}>
          完成
        </button>
      </dialog>
    </div>
  );
}
