import { ui } from "../text/ui";
import { ScreenPlaceholder } from "../ui/ScreenPlaceholder";

/** Placeholder (race team): see the screen map in app/App.tsx. */
export function RaceViewer() {
  return <ScreenPlaceholder title={ui("ui.screen.race.title")} note={ui("ui.screen.race.note")} />;
}
