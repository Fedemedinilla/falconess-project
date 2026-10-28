import { ui } from "../text/ui";
import { Button } from "../ui/Button";
import { type ClockSnapshot, type ReplayClock, SPEEDS } from "./clock";
import s from "./RaceViewer.module.css";
import { secs } from "./words";

export type ControlsProps = {
  clock: ReplayClock;
  snap: ClockSnapshot;
  /** Prefix of the controls' ids ("carrera", "libre"). */
  idPrefix: string;
  /** Jump to the finish and show the result. */
  onFinish: () => void;
};

/** Play and pause, speed, the time slider and the jumps to the start and to the finish. */
export function Controls({ clock, snap, idPrefix, onFinish }: ControlsProps) {
  const now = ui("ui.race.controls.time", { t: secs(snap.tick), end: secs(snap.end) });
  const playLabel = snap.playing
    ? ui("ui.race.controls.pause")
    : snap.atEnd
      ? ui("ui.race.controls.again")
      : snap.tick > 0
        ? ui("ui.race.controls.resume")
        : ui("ui.race.controls.play");
  return (
    <div className={s.controls}>
      <div className={s.transport}>
        <Button
          id={`${idPrefix}-reproducir`}
          variant="primary"
          className={s.play}
          onClick={() => clock.toggle()}
          aria-pressed={snap.playing}
        >
          {playLabel}
        </Button>
        <fieldset className={s.speeds}>
          <legend className="visually-hidden">{ui("ui.race.controls.speed")}</legend>
          {SPEEDS.map((speed) => (
            <Button
              key={speed}
              id={`${idPrefix}-velocidad-${speed}`}
              size="sm"
              variant={snap.speed === speed ? "primary" : "secondary"}
              aria-pressed={snap.speed === speed}
              onClick={() => clock.setSpeed(speed)}
              title={ui("ui.race.controls.speed.title", { n: speed })}
            >
              {ui("ui.race.controls.speed.n", { n: speed })}
            </Button>
          ))}
        </fieldset>
        <Button id={`${idPrefix}-salida`} size="sm" variant="ghost" onClick={() => clock.seek(0)}>
          {ui("ui.race.controls.start")}
        </Button>
        <Button id={`${idPrefix}-meta`} size="sm" onClick={onFinish}>
          {ui("ui.race.controls.finish")}
        </Button>
      </div>
      <div className={s.scrub}>
        <label className="visually-hidden" htmlFor={`${idPrefix}-tiempo`}>
          {ui("ui.race.controls.slider")}
        </label>
        <input
          id={`${idPrefix}-tiempo`}
          className={s.range}
          type="range"
          min={0}
          max={snap.end}
          step={1}
          value={snap.tick}
          aria-valuetext={now}
          onChange={(e) => clock.seek(Number(e.currentTarget.value))}
        />
        <output className={s.clock} htmlFor={`${idPrefix}-tiempo`}>
          {now}
        </output>
      </div>
    </div>
  );
}
