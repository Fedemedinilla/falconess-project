import { ui } from "../text/ui";
import { ScreenPlaceholder } from "../ui/ScreenPlaceholder";

/** Placeholder (season team): see the screen map in app/App.tsx. */
export function Turn() {
  return <ScreenPlaceholder title={ui("ui.screen.turn.title")} note={ui("ui.screen.turn.note")} />;
}
