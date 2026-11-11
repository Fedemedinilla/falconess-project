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
import { lang, onLangChange } from "./text/lang";

/** Content and controller are built inside the boundary: broken content shows the crash screen. */
function Boot() {
  const [controller] = useState(() => new GameController(seasonContent, browserStore()));
  // a new language re-renders every screen in it (the run in play is the same controller)
  const l = useSyncExternalStore(onLangChange, lang);
  return <App key={l} controller={controller} />;
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
