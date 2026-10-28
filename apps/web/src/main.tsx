import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { CrashBoundary } from "./app/CrashBoundary";
import { restoreTheme } from "./app/theme";
import { getContent } from "./content/load";
import { GameController } from "./game/controller";
import { browserStore } from "./game/storage";

/** Content and controller are built inside the boundary: broken content shows the crash screen. */
function Boot() {
  const [controller] = useState(() => new GameController(getContent(), browserStore()));
  return <App controller={controller} />;
}

// the published page is wrapped in the host's document: set the language here
document.documentElement.lang = "es";
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
