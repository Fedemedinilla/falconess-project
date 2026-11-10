import { loadCalendar, loadCatalogueCourses, loadRawContent } from "@falconess/content";
import { buildContentIndex, ContentError, withCalendar } from "@falconess/schema";

try {
  const idx = buildContentIndex(loadRawContent());
  const counts = {
    falconess: idx.falconess.size,
    manufacturers: idx.manufacturers.size,
    frames: idx.frames.size,
    parts: idx.parts.size,
    quirks: idx.quirks.size,
    skills: idx.skills.size,
    events: idx.events.size,
    courses: idx.courses.size,
    textKeys: idx.text.size,
  };
  // ADR-0011 §6: the v3 catalogue tracks (outside the index) and the v3 calendar
  const catalogue = loadCatalogueCourses();
  const known = new Set([...idx.courses.keys(), ...catalogue.map((c) => c.id)]);
  const problems: string[] = [];
  for (const c of catalogue) {
    if (idx.courses.has(c.id)) problems.push(`courses-v3/${c.id}: id also in courses/`);
    if (!idx.text.has(c.textKey)) problems.push(`courses-v3/${c.id}: missing text ${c.textKey}`);
  }
  const calendar = loadCalendar("v3");
  for (const t of calendar.catalogue)
    if (!known.has(t)) problems.push(`calendars/v3: unknown track ${t}`);
  if (problems.length > 0) throw new ContentError(problems);
  // the v3 goals of each Falconess (calendar «goals») name known Falconess and tracks
  const v3 = withCalendar(idx, calendar, catalogue);
  console.log(
    "content: OK",
    JSON.stringify({
      ...counts,
      catalogueV3: catalogue.length,
      calendarV3: calendar.catalogue.length,
      goalsV3: [...v3.falconess.values()].reduce((n, f) => n + f.seasonGoals.length, 0),
    }),
  );
} catch (e) {
  if (e instanceof ContentError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
