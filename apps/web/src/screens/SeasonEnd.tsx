import { ui } from "../text/ui";
import { ScreenPlaceholder } from "../ui/ScreenPlaceholder";

/** Placeholder (season team): see the screen map in app/App.tsx. */
export function SeasonEnd() {
  return (
    <ScreenPlaceholder
      title={ui("ui.screen.seasonEnd.title")}
      note={ui("ui.screen.seasonEnd.note")}
    />
  );
}
