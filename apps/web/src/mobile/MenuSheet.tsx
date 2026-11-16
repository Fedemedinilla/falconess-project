import { useState } from "react";
import { ui } from "../text/ui";
import { cx } from "../ui/cx";
import { useModalDialog } from "../ui/useModalDialog";
import { Glyph } from "./Glyph";
import { LangButton } from "./LangButton";
import s from "./Mobile.module.css";
import { getMusicOn, setMusicOn } from "./music";
import { PANEL_GLYPH, type PanelTab, panelTitle } from "./Panels";
import { nextPace, setPace } from "./pace";
import st from "./Story.module.css";
import { getSoundStyle, nextSoundStyle, playSound, type SoundStyle, setSoundStyle } from "./sfx";
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

/** The menu's own buttons: in the phone's sheet and in the wide screen's panel. */
export function MenuItems({
  onExport,
  onHistory,
  onTests,
  onNew,
  chatName,
  chatNew,
  onChat,
  onStory,
}: MenuItemsProps) {
  const [confirm, setConfirm] = useState(false);
  const [sound, setSound] = useState<SoundStyle>(getSoundStyle);
  const [music, setMusicState] = useState(getMusicOn);
  const pace = usePace();
  const onSound = () => {
    const next = nextSoundStyle(sound);
    setSoundStyle(next);
    setSound(next);
    // the new style says itself: its success
    playSound("success");
  };
  return (
    <>
      <button type="button" className={s.btn} id="m-chat-abrir" data-new={chatNew} onClick={onChat}>
        <Glyph name="chat" size={20} />
        {ui("ui.m.chat.with", { name: chatName })}
        {chatNew && <span className={st.newTag}>{ui("ui.m.chat.new")}</span>}
      </button>
      <button type="button" className={s.btn} id="m-historia-abrir" onClick={onStory}>
        <Glyph name="book" size={20} />
        {ui("ui.m.story.title")}
      </button>
      <button type="button" className={s.btn} id="m-exportar-partida" onClick={onExport}>
        <Glyph name="down" size={20} />
        {ui("ui.m.export.run")}
      </button>
      <button type="button" className={s.btn} id="m-temporadas" onClick={onHistory}>
        <Glyph name="book" size={20} />
        {ui("ui.m.history.title")}
      </button>
      <button type="button" className={s.btn} id="m-pruebas" onClick={onTests}>
        <Glyph name="screen" size={20} />
        {ui("ui.m.tests")}
      </button>
      <button
        type="button"
        className={s.btn}
        id="m-sonido"
        data-style={sound}
        aria-label={ui("ui.m.sound.label", { style: ui(`ui.m.sound.${sound}`) })}
        onClick={onSound}
      >
        <Glyph name={sound === "off" ? "mute" : "speaker"} size={20} />
        {ui("ui.m.sound", { style: ui(`ui.m.sound.${sound}`) })}
      </button>
      <button
        type="button"
        className={s.btn}
        id="m-musica"
        data-on={music}
        onClick={() => {
          setMusicOn(!music);
          setMusicState(!music);
        }}
      >
        <Glyph name={music ? "note" : "mute"} size={20} />
        {ui("ui.m.music", { state: ui(music ? "ui.m.music.on" : "ui.m.music.off") })}
      </button>
      <button
        type="button"
        className={s.btn}
        id="m-ritmo"
        data-pace={pace}
        aria-label={ui("ui.m.pace.label", { pace: ui(`ui.m.pace.${pace}`) })}
        onClick={() => setPace(nextPace(pace))}
      >
        <Glyph name="skip" size={20} />
        {ui("ui.m.pace", { pace: ui(`ui.m.pace.${pace}`) })}
      </button>
      <LangButton className={s.btn} id="m-idioma" />
      {confirm ? (
        <button type="button" className={cx(s.btn, s.btnMain)} id="m-nueva-si" onClick={onNew}>
          {ui("ui.m.new.confirm")}
        </button>
      ) : (
        <button type="button" className={s.btn} id="m-nueva" onClick={() => setConfirm(true)}>
          <Glyph name="flag" size={20} />
          {ui("ui.m.new")}
        </button>
      )}
    </>
  );
}

/**
 * «Menú» on a phone: the panels first (owner 2026-11-13), then the menu's buttons. Each button
 * closes the sheet before it acts.
 */
export function MobileMenu({
  open,
  onClose,
  onPanel,
  guideNew,
  items,
}: {
  open: boolean;
  onClose: () => void;
  onPanel: (tab: PanelTab) => void;
  guideNew: boolean;
  items: MenuItemsProps;
}) {
  // mounted on open: its buttons start fresh each time («Nueva temporada» unconfirmed)
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
        <h2 className={s.dlTitle} id="m-menu-titulo">
          {ui("ui.m.menu")}
        </h2>
        {(["guide", "goals", "crews", "log"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={s.btn}
            id={`m-panel-abrir-${t}`}
            onClick={() => {
              onClose();
              onPanel(t);
            }}
          >
            <Glyph name={PANEL_GLYPH[t]} size={20} />
            {panelTitle(t)}
            {t === "guide" && guideNew && <span className={st.newTag}>{ui("ui.m.guide.new")}</span>}
          </button>
        ))}
        <MenuItems {...items} {...menuActions(items, onClose)} />
        <button type="button" className={cx(s.btn, s.btnDark)} id="m-menu-cerrar" onClick={onClose}>
          {ui("ui.m.close")}
        </button>
      </div>
    </dialog>
  );
}
