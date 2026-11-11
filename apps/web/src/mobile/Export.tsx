import { useEffect, useRef, useState } from "react";
import { exportFileName, type SeasonEntry } from "../game/history";
import { locale } from "../text/lang";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Glyph } from "./Glyph";
import s from "./Mobile.module.css";

/** A season to export: its save JSON and a file name. */
export type ExportItem = {
  readonly text: string;
  readonly fileName: string;
  readonly title: string;
};

/** A `<dialog>` that follows `open` (the same pattern as the «Menú» sheet). */
function useSheet(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) d.close();
  }, [open]);
  return ref;
}

type Status = "idle" | "copied" | "downloaded" | "shared" | "failed";

/** Copy with the clipboard API, else by selecting the text field (older iOS, sandboxed frames). */
async function copyText(text: string, field: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the selection
  }
  if (!field) return false;
  field.focus();
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/** What this page needs of the claude.ai `downloads` capability (published artifact only). */
type Saver = (request: { filename: string; data: string }) => Promise<unknown>;

/**
 * Inside claude.ai a page may not download by itself: it offers the file through the viewer's
 * `downloads` capability (a confirmation, the share sheet in the iOS app). Undefined anywhere
 * else (the standalone demo, the dev server), where a plain download works.
 */
async function claudeSaver(): Promise<Saver | undefined> {
  const claude: unknown = Reflect.get(globalThis, "claude");
  if (typeof claude !== "object" || claude === null) return undefined;
  const use: unknown = Reflect.get(claude, "use");
  if (typeof use !== "function") return undefined;
  try {
    const ns: unknown = await use.call(claude, "downloads");
    if (typeof ns !== "object" || ns === null) return undefined;
    const save: unknown = Reflect.get(ns, "save");
    if (typeof save !== "function") return undefined;
    return (request) => Promise.resolve(save.call(ns, request));
  } catch {
    return undefined;
  }
}

function fileOf(item: ExportItem): File | undefined {
  try {
    return new File([item.text], item.fileName, { type: "application/json" });
  } catch {
    return undefined;
  }
}

/**
 * «Exportar» (owner 2026-11-11, for the testers): a season's save as a file or as text. On a phone
 * «Compartir» opens the system sheet (WhatsApp, mail, Files); «Descargar» saves the .json;
 * «Copiar texto» puts it on the clipboard. The text is also shown, selectable, for when the page
 * may do none of those (inside another app's frame).
 */
export function ExportSheet({
  item,
  onClose,
}: {
  item: ExportItem | undefined;
  onClose: () => void;
}) {
  const ref = useSheet(item !== undefined);
  const field = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new item starts clean
  useEffect(() => setStatus("idle"), [item]);
  const file = item && fileOf(item);
  const canShare =
    file !== undefined &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  const share = async () => {
    if (!item || !file) return;
    try {
      await navigator.share({ files: [file], title: item.title });
      setStatus("shared");
    } catch {
      // the player closed the sheet, or the page may not share: nothing to say
    }
  };
  const download = async () => {
    if (!item) return;
    const saver = await claudeSaver();
    if (saver) {
      try {
        await saver({ filename: item.fileName, data: item.text });
        setStatus("downloaded");
      } catch (e) {
        // the viewer said no: nothing to report; anything else, the text below still works
        const code: unknown =
          typeof e === "object" && e !== null ? Reflect.get(e, "code") : undefined;
        setStatus(code === "declined" ? "idle" : "failed");
      }
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([item.text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = item.fileName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("downloaded");
    } catch {
      setStatus("failed");
    }
  };
  const copy = async () => {
    if (!item) return;
    setStatus((await copyText(item.text, field.current)) ? "copied" : "failed");
  };

  return (
    <dialog
      ref={ref}
      className={s.sheet}
      id="m-exportar"
      aria-labelledby="m-exportar-titulo"
      onClose={onClose}
    >
      {item && (
        <div className={s.dl}>
          <h2 className={s.dlTitle} id="m-exportar-titulo">
            {ui("ui.m.export.title")}
          </h2>
          <p className={s.exportWhat}>{item.title}</p>
          {canShare && (
            <button
              type="button"
              className={cx(s.btn, s.btnMain)}
              id="m-exportar-compartir"
              onClick={share}
            >
              {ui("ui.m.export.share")}
            </button>
          )}
          <button type="button" className={s.btn} id="m-exportar-descargar" onClick={download}>
            <Glyph name="down" size={20} />
            {ui("ui.m.export.download")}
          </button>
          <button type="button" className={s.btn} id="m-exportar-copiar" onClick={copy}>
            <Glyph name="book" size={20} />
            {ui("ui.m.export.copy")}
          </button>
          <p
            className={s.exportStatus}
            id="m-exportar-estado"
            data-status={status}
            aria-live="polite"
          >
            {status === "idle" ? ui("ui.m.export.hint") : ui(`ui.m.export.${status}`)}
          </p>
          <textarea
            ref={field}
            className={s.exportText}
            id="m-exportar-texto"
            readOnly
            value={item.text}
            aria-label={ui("ui.m.export.text")}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className={cx(s.btn, s.btnDark)}
            id="m-exportar-cerrar"
            onClick={onClose}
          >
            {ui("ui.m.close")}
          </button>
        </div>
      )}
    </dialog>
  );
}

/** One season of the history as a line: «Peregrina · Exigente», «Nota B · completa». */
export function entryLine(entry: SeasonEntry): { name: string; detail: string } {
  const name = `${gameText(`falconess.${entry.falconessId}`)} · ${ui(`ui.m.difficulty.${entry.difficulty}`)}`;
  const detail =
    entry.status === "active"
      ? ui("ui.m.history.active", { turn: entry.turn })
      : entry.endReason === "goal-failed"
        ? ui("ui.m.history.failed", { turn: entry.turn, grade: entry.grade ?? "G" })
        : ui("ui.m.history.done", { grade: entry.grade ?? "G" });
  return { name, detail };
}

/** An entry as what «Exportar» hands out. */
export function entryItem(entry: SeasonEntry): ExportItem {
  const line = entryLine(entry);
  return {
    text: entry.save,
    fileName: exportFileName(entry),
    title: `${line.name} · ${line.detail}`,
  };
}

/**
 * «Temporadas anteriores»: every season this browser played, newest first, each with its
 * «Exportar». The list is what the controller kept (`history.ts`).
 */
export function HistorySheet({
  open,
  entries,
  onExport,
  onClose,
}: {
  open: boolean;
  entries: readonly SeasonEntry[];
  onExport: (entry: SeasonEntry) => void;
  onClose: () => void;
}) {
  const ref = useSheet(open);
  const date = new Intl.DateTimeFormat(locale(), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      id="m-historial"
      aria-labelledby="m-historial-titulo"
      onClose={onClose}
    >
      <div className={s.dl}>
        <h2 className={s.dlTitle} id="m-historial-titulo">
          {ui("ui.m.history.title")}
        </h2>
        {entries.length === 0 && <p className={s.exportWhat}>{ui("ui.m.history.empty")}</p>}
        <ul className={s.histList}>
          {entries.map((e) => {
            const line = entryLine(e);
            const when = new Date(e.updatedAt);
            return (
              <li key={e.seed} className={s.histRow} data-seed={e.seed}>
                <span className={s.histT}>
                  <b>{line.name}</b>
                  <span>{line.detail}</span>
                  <span className={s.histWhen}>
                    {Number.isNaN(when.getTime()) ? "" : date.format(when)}
                  </span>
                </span>
                <button type="button" className={s.histBtn} onClick={() => onExport(e)}>
                  {ui("ui.m.export.short")}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className={cx(s.btn, s.btnDark)}
          id="m-historial-cerrar"
          onClick={onClose}
        >
          {ui("ui.m.close")}
        </button>
      </div>
    </dialog>
  );
}
