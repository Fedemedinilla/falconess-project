import { ui } from "../text/ui";
import { ScreenPlaceholder } from "../ui/ScreenPlaceholder";

/** Placeholder (season team): see the screen map in app/App.tsx. */
export function Workshop() {
  return (
    <ScreenPlaceholder
      title={ui("ui.screen.workshop.title")}
      note={ui("ui.screen.workshop.note")}
    />
  );
}
