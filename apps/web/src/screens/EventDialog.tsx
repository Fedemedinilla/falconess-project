import { ui } from "../text/ui";
import { ScreenPlaceholder } from "../ui/ScreenPlaceholder";

/** Placeholder (season team): see the screen map in app/App.tsx. */
export function EventDialog() {
  return (
    <ScreenPlaceholder title={ui("ui.screen.event.title")} note={ui("ui.screen.event.note")} />
  );
}
