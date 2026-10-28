import { ui } from "../text/ui";
import { ScreenPlaceholder } from "../ui/ScreenPlaceholder";

/** Placeholder (race team): see the screen map in app/App.tsx. */
export function FreeRace() {
  return (
    <ScreenPlaceholder
      title={ui("ui.screen.freeRace.title")}
      note={ui("ui.screen.freeRace.note")}
    />
  );
}
