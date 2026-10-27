import { loadRawContent } from "@falconess/content";
import { buildContentIndex, ContentError } from "@falconess/schema";

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
  console.log("content: OK", JSON.stringify(counts));
} catch (e) {
  if (e instanceof ContentError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
