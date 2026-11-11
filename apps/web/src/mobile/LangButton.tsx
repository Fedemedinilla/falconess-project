import { type Lang, lang, otherLang, setLang } from "../text/lang";
import { ui } from "../text/ui";
import { Glyph } from "./Glyph";

/** Each language by its own name, whatever the page's language. */
const NAME: Readonly<Record<Lang, string>> = { es: "Español", en: "English" };

/**
 * «Idioma: Español» / «Language: English» (owner 2026-11-11): one tap switches between the two,
 * like the sound switch. The page re-renders in the new language; the run in play stays.
 */
export function LangButton({ id, className }: { id: string; className?: string | undefined }) {
  const now = lang();
  const next = otherLang(now);
  return (
    <button
      type="button"
      className={className}
      id={id}
      data-lang={now}
      aria-label={ui("ui.m.lang.label", { lang: NAME[now], next: NAME[next] })}
      onClick={() => setLang(next)}
    >
      <Glyph name="globe" size={20} />
      {ui("ui.m.lang", { lang: NAME[now] })}
    </button>
  );
}
