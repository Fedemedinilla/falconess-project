import { ui } from "../text/ui";
import { ScreenPlaceholder } from "../ui/ScreenPlaceholder";

/** Placeholder (season team): see the screen map in app/App.tsx. */
export function NewSeason() {
  return (
    <ScreenPlaceholder
      title={ui("ui.screen.newSeason.title")}
      note={ui("ui.screen.newSeason.note")}
    />
  );
}
