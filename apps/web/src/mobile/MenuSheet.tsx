import { type ReactNode, useRef, useState } from "react";
import { readKey, removeKey, sessionStore, writeKey } from "../game/storage";
import { type Lang, lang, setLang } from "../text/lang";
import { ui } from "../text/ui";
import { cx } from "../ui/cx";
import { useLatest } from "../ui/useLatest";
import { useHeld, useModalDialog } from "../ui/useModalDialog";
import { Glyph, type GlyphName } from "./Glyph";
import m from "./MenuSheet.module.css";
import s from "./Mobile.module.css";
import { getMusicOn, setMusicOn } from "./music";
import { PACES, type Pace, setPace } from "./pace";
import { getSoundStyle, playSound, SOUND_STYLES, type SoundStyle, setSoundStyle } from "./sfx";
import { usePace } from "./usePace";

/** What the menu's own buttons do: the same in the phone's «Menú» sheet and the wide screen's panel. */
export type MenuActions = {
  readonly onExport: () => void;
  readonly onHistory: () => void;
  readonly onTests: () => void;
  readonly onNew: () => void;
  readonly onChat: () => void;
  readonly onStory: () => void;
};

/** The menu's buttons: what they do, her name on «Chat» and whether it has something new. */
export type MenuItemsProps = MenuActions & {
  readonly chatName: string;
  readonly chatNew: boolean;
};

/** Each language by its own name, whatever the page's language. */
const LANG_NAME: Readonly<Record<Lang, string>> = { es: "Español", en: "English" };

const soundText = (style: SoundStyle) => ui(`ui.m.sound.${style}`);
const paceText = (pace: Pace) => ui(`ui.m.pace.${pace}`);

/**
 * The phone's «Menú» sheet closes before its button acts (what the button opens takes its place);
 * «Pruebas» leaves the game, which takes the sheet with it.
 */
function menuActions(actions: MenuActions, close: () => void): MenuActions {
  const closing = (act: () => void) => () => {
    close();
    act();
  };
  return {
    onExport: closing(actions.onExport),
    onHistory: closing(actions.onHistory),
    onTests: actions.onTests,
    onNew: closing(actions.onNew),
    onChat: closing(actions.onChat),
    onStory: closing(actions.onStory),
  };
}

// --- the settings, shared by the phone's «Ajustes» and the wide screen's panel --------------------

/**
 * A new language draws the page again (`<App key={lang}>` in `main.tsx`: every per-language cache
 * starts over), and «Menú» goes with it. This one-shot flag, set just before the switch and read
 * once by the next mount, brings the sheet back at «Ajustes» (owner 2026-11-28). This tab only: a
 * reload or another visit opens nothing.
 */
const SETTINGS_RETURN_KEY = "falconess.juego.ajustes";

/** The phone's «Ajustes» switches the language: «Menú» comes back there after the remount. */
function langFromSettings(next: Lang): void {
  if (next === lang()) return;
  writeKey(sessionStore(), SETTINGS_RETURN_KEY, "1");
  setLang(next);
}

/** Whether a language switch from «Ajustes» left «Menú» to reopen there; read once, it is gone. */
export function takeSettingsReturn(): boolean {
  const store = sessionStore();
  const on = readKey(store, SETTINGS_RETURN_KEY) === "1";
  removeKey(store, SETTINGS_RETURN_KEY);
  return on;
}

/** Sonido, Música, Ritmo and Idioma as values with setters. */
function useSettings() {
  const [sound, setSound] = useState<SoundStyle>(getSoundStyle);
  const [music, setMusicState] = useState(getMusicOn);
  const pace = usePace();
  return {
    sound,
    toSound: (next: SoundStyle) => {
      setSoundStyle(next);
      setSound(next);
      // the new style says itself: its success
      playSound("success");
    },
    music,
    toMusic: (on: boolean) => {
      setMusicOn(on);
      setMusicState(on);
    },
    pace,
    toPace: setPace,
  };
}

/** A setting: its name, then every value it can take, the one it stands at pressed (owner's D). */
function SegRow<T extends string>({
  id,
  glyph,
  label,
  values,
  value,
  text,
  stacked = false,
  onPick,
}: {
  id: string;
  glyph: GlyphName;
  label: string;
  values: readonly T[];
  value: T;
  text: (v: T) => string;
  /** Values too wide for one row: the choices go on their own line under the name. */
  stacked?: boolean;
  onPick: (v: T) => void;
}) {
  return (
    <div className={cx(m.setRow, stacked && m.setStacked)} id={id} data-value={value}>
      <span className={m.setLb}>
        <Glyph name={glyph} size={19} className={m.setIcon} />
        {label}
      </span>
      <span className={m.segs}>
        {values.map((v) => (
          <button
            key={v}
            type="button"
            className={cx(m.seg, v === value && m.segOn)}
            id={`${id}-${v}`}
            aria-label={`${label}: ${text(v)}`}
            aria-pressed={v === value}
            onClick={() => onPick(v)}
          >
            {text(v)}
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * The four settings as cards, one tap to any value (owner 2026-11-18). The same component in the
 * phone's «Ajustes» sheet and in the wide screen's «Menú» tab, so a setting is set the same way on
 * both. Switching the language re-renders the whole page in it (`main.tsx`), as it always did.
 */
export function SettingsCards({ onLang = setLang }: { onLang?: (next: Lang) => void } = {}) {
  const set = useSettings();
  return (
    <>
      <SegRow
        id="m-sonido"
        glyph={set.sound === "off" ? "mute" : "speaker"}
        label={ui("ui.m.sound.name")}
        values={SOUND_STYLES}
        value={set.sound}
        text={soundText}
        stacked
        onPick={set.toSound}
      />
      <SegRow
        id="m-musica"
        glyph={set.music ? "note" : "mute"}
        label={ui("ui.m.music.name")}
        values={["on", "off"] as const}
        value={set.music ? "on" : "off"}
        text={(v) => ui(`ui.m.music.${v}`)}
        onPick={(v) => set.toMusic(v === "on")}
      />
      <SegRow
        id="m-ritmo"
        glyph="skip"
        label={ui("ui.m.pace.name")}
        values={PACES}
        value={set.pace}
        text={paceText}
        stacked
        onPick={set.toPace}
      />
      <SegRow
        id="m-idioma"
        glyph="globe"
        label={ui("ui.m.lang.name")}
        values={["es", "en"] as const}
        value={lang()}
        text={(l) => LANG_NAME[l]}
        onPick={onLang}
      />
    </>
  );
}

/** What «Ajustes» holds now, for its row in the root: its four values, in the order it lists them. */
function settingsHint(pace: Pace): string {
  return [
    soundText(getSoundStyle()),
    ui(getMusicOn() ? "ui.m.music.on" : "ui.m.music.off"),
    paceText(pace),
    LANG_NAME[lang()],
  ].join(" · ");
}

// --- the rows -------------------------------------------------------------------------------------

function ChatRow({ items, acts }: { items: MenuItemsProps; acts: MenuActions }) {
  return (
    <button
      type="button"
      className={s.btn}
      id="m-chat-abrir"
      data-new={items.chatNew}
      onClick={acts.onChat}
    >
      <Glyph name="chat" size={20} />
      {ui("ui.m.chat.with", { name: items.chatName })}
      {items.chatNew && (
        <span className={m.tag} id="m-chat-nuevo">
          {ui("ui.m.chat.new")}
        </span>
      )}
    </button>
  );
}

/** Historia, Exportar partida, Temporadas anteriores, Vista de pruebas: one row each. */
function ActionRow({
  id,
  glyph,
  label,
  onClick,
}: {
  id: string;
  glyph: GlyphName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={s.btn} id={id} onClick={onClick}>
      <Glyph name={glyph} size={20} />
      {label}
    </button>
  );
}

/**
 * «Nueva temporada»: two taps, always. The confirm takes the row's place in the same box, so
 * nothing under it moves between the two taps (it used to grow from 48 to 56 px and wrap, pushing
 * «Cerrar» down about 24 px).
 */
function NewSeasonRow({ onNew }: { onNew: () => void }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm)
    return (
      <button type="button" className={cx(m.newBtn, m.newYes)} id="m-nueva-si" onClick={onNew}>
        {ui("ui.m.new.confirm")}
      </button>
    );
  return (
    <button type="button" className={m.newBtn} id="m-nueva" onClick={() => setConfirm(true)}>
      <Glyph name="flag" size={20} />
      {ui("ui.m.new")}
    </button>
  );
}

/** A row that opens a second level: its name, what it holds now, and the chevron. */
function GroupRow({
  id,
  glyph,
  label,
  hint,
  onClick,
}: {
  id: string;
  glyph: GlyphName;
  label: string;
  hint?: string | undefined;
  onClick: () => void;
}) {
  return (
    <button type="button" className={m.group} id={id} onClick={onClick}>
      <Glyph name={glyph} size={22} />
      <span className={m.groupText}>
        <span className={m.groupLb}>{label}</span>
        {hint && <small className={m.groupHint}>{hint}</small>}
      </span>
      <Glyph name="right" size={20} className={m.chev} />
    </button>
  );
}

/**
 * The menu's own buttons on the wide screen (its panel's «Menú» tab): there is room, so the
 * settings are inline here, with no second level — the same cards the phone's «Ajustes» shows.
 */
export function MenuItems(props: MenuItemsProps) {
  return (
    <>
      <ChatRow items={props} acts={props} />
      <ActionRow
        id="m-historia-abrir"
        glyph="book"
        label={ui("ui.m.story.title")}
        onClick={props.onStory}
      />
      <SettingsCards />
      <ActionRow
        id="m-exportar-partida"
        glyph="down"
        label={ui("ui.m.export.run")}
        onClick={props.onExport}
      />
      <ActionRow
        id="m-temporadas"
        glyph="book"
        label={ui("ui.m.history.title")}
        onClick={props.onHistory}
      />
      <ActionRow id="m-pruebas" glyph="screen" label={ui("ui.m.tests")} onClick={props.onTests} />
      <NewSeasonRow onNew={props.onNew} />
    </>
  );
}

// --- the sheets -----------------------------------------------------------------------------------

/** The root level: the sheet, «Menú» as its title and «Cerrar» at the bottom. */
function RootSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { ref, mounted } = useModalDialog(open, onClose);
  if (!mounted) return null;
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      id="m-menu-dialogo"
      aria-labelledby="m-menu-titulo"
      onClose={onClose}
    >
      <div className={s.dl}>
        <h2 className={s.dlTitle} id="m-menu-titulo" tabIndex={-1}>
          {ui("ui.m.menu")}
        </h2>
        {children}
        <button type="button" className={cx(s.btn, s.btnDark)} id="m-menu-cerrar" onClick={onClose}>
          {ui("ui.m.close")}
        </button>
      </div>
    </dialog>
  );
}

/**
 * A second level of «Menú»: a sheet of its own, which rises while the root goes out under it (the
 * same hand-off Guía and Metas use). It opens at its top with its own title focused (L6), «Volver»
 * brings the root back, and «Cerrar», Escape and the back gesture take the whole menu, as ADR-0017
 * §9 asks of every sheet.
 */
function SubSheet({
  id,
  title: openTitle,
  open,
  onBack,
  onClose,
  children: openChildren,
}: {
  id: string;
  title: string;
  open: boolean;
  onBack: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { ref, mounted } = useModalDialog(open, onClose);
  const { title, children } = useHeld({ title: openTitle, children: openChildren }, open);
  if (!mounted) return null;
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      id={id}
      aria-labelledby={`${id}-titulo`}
      onClose={onClose}
    >
      <div className={s.dl}>
        <div className={m.subHead}>
          <button
            type="button"
            className={m.backBtn}
            id={`${id}-volver`}
            aria-label={ui("ui.m.back")}
            onClick={onBack}
          >
            <Glyph name="back" size={22} weight={2.6} />
          </button>
          <h2 className={s.dlTitle} id={`${id}-titulo`} tabIndex={-1}>
            {title}
          </h2>
        </div>
        {children}
        <button
          type="button"
          className={cx(s.btn, s.btnDark)}
          id={`${id}-cerrar`}
          onClick={onClose}
        >
          {ui("ui.m.close")}
        </button>
      </div>
    </dialog>
  );
}

export type MenuLevel = "settings" | "run";
type Sub = MenuLevel | undefined;

/**
 * The root and at most one second level. The root closes as a level rises, so its native close must
 * not take the whole menu with it (the level is what the player is looking at); on «Volver» the
 * root rises again.
 */
function useLevels(open: boolean, closeAll: () => void, at: Sub) {
  const [sub, setSub] = useState<Sub>(undefined);
  // each open starts at the root, or at the level it was asked at (a language switch, which
  // remounts the page, comes back at «Ajustes»)
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    setSub(open ? at : undefined);
  }
  const subRef = useLatest(sub);
  // «Volver» before the root finished fading out (180 ms) would find its `<dialog>` still open and
  // under the level in the top layer: it would come back without its title focused, and under a
  // sheet that is still modal. A new key makes it a new element, which opens on its title (L6).
  const [epoch, setEpoch] = useState(0);
  // «Volver» closes the level too, and a sheet that closes says so: without this the whole menu
  // would go 180 ms after the tap, with the root already back on screen
  const back = useRef(false);
  return {
    setSub,
    rootOpen: open && sub === undefined,
    /** The root closed: the whole menu only when no level took its place. */
    onRootClose: () => {
      if (subRef.current === undefined) closeAll();
    },
    /** A level closed: the whole menu, unless «Volver» is what closed it. */
    onSubClose: () => {
      if (back.current) {
        back.current = false;
        return;
      }
      closeAll();
    },
    back: () => {
      back.current = true;
      setSub(undefined);
      setEpoch((e) => e + 1);
    },
    epoch,
    isOpen: (which: Exclude<Sub, undefined>) => open && sub === which,
  };
}

/**
 * «Menú» on a phone (owner 2026-11-18): a short root — Chat, Historia, «Ajustes ▸» with what it
 * holds, «Partida ▸» — and two second levels. The four reading panels are not here any more: they
 * live on the week menu's rail. Each button closes the sheet before it acts.
 */
export function MobileMenu({
  open,
  at,
  onClose,
  items,
}: {
  open: boolean;
  /** The level it opens at: the root, unless a language switch brings it back at «Ajustes». */
  at?: MenuLevel | undefined;
  /** «Cerrar», Escape and the back gesture: the whole menu goes, from any level. */
  onClose: () => void;
  items: MenuItemsProps;
}) {
  const lv = useLevels(open, onClose, at);
  const pace = usePace();
  // mounted on open: its buttons start fresh each time («Nueva temporada» unconfirmed)
  const acts = menuActions(items, onClose);
  return (
    <>
      <RootSheet key={lv.epoch} open={lv.rootOpen} onClose={lv.onRootClose}>
        <ChatRow items={items} acts={acts} />
        <ActionRow
          id="m-historia-abrir"
          glyph="book"
          label={ui("ui.m.story.title")}
          onClick={acts.onStory}
        />
        <GroupRow
          id="m-grupo-ajustes"
          glyph="sliders"
          label={ui("ui.m.group.settings")}
          hint={settingsHint(pace)}
          onClick={() => lv.setSub("settings")}
        />
        <GroupRow
          id="m-grupo-partida"
          glyph="box"
          label={ui("ui.m.group.run")}
          onClick={() => lv.setSub("run")}
        />
      </RootSheet>
      <SubSheet
        id="m-ajustes-hoja"
        title={ui("ui.m.group.settings")}
        open={lv.isOpen("settings")}
        onBack={lv.back}
        onClose={lv.onSubClose}
      >
        <SettingsCards onLang={langFromSettings} />
      </SubSheet>
      <SubSheet
        id="m-partida-hoja"
        title={ui("ui.m.group.run")}
        open={lv.isOpen("run")}
        onBack={lv.back}
        onClose={lv.onSubClose}
      >
        <ActionRow
          id="m-exportar-partida"
          glyph="down"
          label={ui("ui.m.export.run")}
          onClick={acts.onExport}
        />
        <ActionRow
          id="m-temporadas"
          glyph="book"
          label={ui("ui.m.history.title")}
          onClick={acts.onHistory}
        />
        <ActionRow id="m-pruebas" glyph="screen" label={ui("ui.m.tests")} onClick={acts.onTests} />
        <NewSeasonRow onNew={acts.onNew} />
      </SubSheet>
    </>
  );
}
