import type { SeasonState } from "@falconess/schema";
import { bondLevel, inSync, type SimContext } from "@falconess/sim";
import { type CSSProperties, useEffect, useRef } from "react";
import { outingPreview } from "../screens/model/actions";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import s from "./Mobile.module.css";
import { crewInitials } from "./model";

/**
 * ADR-0016: the outing is with a crew of her hangar, chosen here (+10 bond with it). Each row shows
 * the crew's bond bar with the sintonía mark, so the player sees who is closest to it.
 */
export function OutingSheet({
  ctx,
  state,
  open,
  onPick,
  onClose,
}: {
  ctx: SimContext;
  state: SeasonState;
  open: boolean;
  onPick: (manufacturer: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) d.close();
  }, [open]);
  const S = ctx.ruleset.season;
  const bondMax = Math.floor(100 / S.bondLevelStep);
  const syncLevel = S.crewSync ? bondLevel(ctx, S.crewSync.minBond) : undefined;
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      id="m-salida-cuadrilla"
      aria-labelledby="m-salida-titulo"
      onClose={onClose}
    >
      <div className={s.dl}>
        <h2 className={s.dlTitle} id="m-salida-titulo">
          {ui("ui.m.outing.title")}
        </h2>
        <p className={s.exportWhat}>{ui("ui.m.outing.hint", { n: S.bondPerOuting })}</p>
        <ul className={s.histList}>
          {outingPreview(ctx, state).crews.map((id) => {
            const maker = ctx.content.getManufacturer(id);
            const bond = state.bond[id] ?? 0;
            const level = Math.min(bondMax, bondLevel(ctx, bond));
            const sync = inSync(ctx, bond);
            return (
              <li key={id} className={s.histRow} data-crew={id}>
                <span
                  className={cx(s.portrait, s.portraitSmall, sync && s.portraitSync)}
                  style={
                    {
                      "--bc": maker.palette.primary,
                      "--bc2": maker.palette.secondary,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                >
                  {crewInitials(gameText(maker.textKey))}
                </span>
                <span className={s.histT}>
                  <b>{gameText(maker.crew.textKey)}</b>
                  <span
                    className={s.seg}
                    role="img"
                    aria-label={ui("ui.m.crew.bond", { n: level, max: bondMax })}
                  >
                    {Array.from({ length: bondMax }, (_, i) => (
                      <i
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed segments of a bar
                        key={i}
                        className={cx(
                          i < level && (sync ? s.segSync : s.segOn),
                          syncLevel !== undefined && i === syncLevel - 1 && s.segGoal,
                        )}
                      />
                    ))}
                  </span>
                  {sync && <span className={s.syncTag}>{ui("ui.m.crew.sync")}</span>}
                </span>
                <button
                  type="button"
                  className={s.histBtn}
                  id={`m-salida-con-${id}`}
                  onClick={() => onPick(id)}
                >
                  {ui("ui.m.outing.go")}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className={cx(s.btn, s.btnDark)}
          id="m-salida-cerrar"
          onClick={onClose}
        >
          {ui("ui.m.close")}
        </button>
      </div>
    </dialog>
  );
}
