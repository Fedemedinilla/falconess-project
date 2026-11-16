import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { CrashBoundary } from "./app/CrashBoundary";
import { restoreTheme } from "./app/theme";
import { seasonContent } from "./content/load";
import { GameController } from "./game/controller";
import { browserStore } from "./game/storage";
import { WeekStore } from "./mobile/flow/decidedWeek";
import { InspirationStore, savedRun } from "./mobile/flow/inspirations";
import { FlowStoresContext } from "./mobile/useFlow";
import { lang, onLangChange } from "./text/lang";

/**
 * Content, controller and the phone game's stores are built inside the boundary (broken content
 * shows the crash screen), once, on the browser's storage: they outlive the language's remount.
 * The inheritance cards' store marks, on its first load, the cards an earlier build already showed
 * of the saved run; the week's store keeps a race week's record across reloads (D5).
 */
function Boot() {
  const [{ controller, stores }] = useState(() => {
    const store = browserStore();
    return {
      controller: new GameController(seasonContent, store),
      stores: {
        cards: new InspirationStore(store, () => savedRun(seasonContent, store)),
        weeks: new WeekStore(store),
      },
    };
  });
  // a new language re-renders every screen in it (the run in play is the same controller)
  const l = useSyncExternalStore(onLangChange, lang);
  return (
    <FlowStoresContext value={stores}>
      <App key={l} controller={controller} />
    </FlowStoresContext>
  );
}

// the published page is wrapped in the host's document: set the language here
document.documentElement.lang = lang();
restoreTheme();

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <CrashBoundary>
        <Boot />
      </CrashBoundary>
    </StrictMode>,
  );
