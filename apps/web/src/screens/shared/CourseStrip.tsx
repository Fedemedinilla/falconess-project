import { courseLength, SEGMENT_TYPES } from "@falconess/schema";
import { catalogueCourses, getContent } from "../../content/load";
import type { Detail } from "../../text/brief";
import { formatInt } from "../../text/format";
import { gameText, ui } from "../../text/ui";
import s from "./CourseStrip.module.css";

export type CourseStripProps = {
  courseId: string;
  /**
   * List the segment types under the strip: their names ("brief"), or with the metres of each
   * type ("full"). No legend when undefined.
   */
  legend?: Detail | undefined;
};

/** A course as one strip: every segment at its length, colored by its type. */
export function CourseStrip({ courseId, legend }: CourseStripProps) {
  // a v3 goal can run on a catalogue track, outside the content index (ADR-0011 §6)
  const course =
    catalogueCourses().find((c) => c.id === courseId) ?? getContent().getCourse(courseId);
  const total = courseLength(course);
  const types = SEGMENT_TYPES.filter((t) => course.segments.some((seg) => seg.type === t));
  const label = ui("ui.course.strip", {
    course: gameText(course.textKey),
    meters: total,
    segments: course.segments
      .map((seg) =>
        ui("ui.course.segment", { segment: gameText(`segment.${seg.type}`), meters: seg.length }),
      )
      .join(", "),
  });
  return (
    <div className={s.wrap}>
      <div className={s.strip} role="img" aria-label={label}>
        {course.segments.map((seg, i) => (
          <span
            // segments have no id; their order is the course
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed content order
            key={i}
            className={s.segment}
            style={{ flexGrow: seg.length, background: `var(--seg-${seg.type})` }}
            title={ui("ui.course.segment", {
              segment: gameText(`segment.${seg.type}`),
              meters: seg.length,
            })}
          />
        ))}
      </div>
      {legend && (
        <ul className={s.legend} aria-hidden="true">
          {types.map((t) => (
            <li key={t}>
              <span className={s.swatch} style={{ background: `var(--seg-${t})` }} />
              {legend === "full"
                ? ui("ui.course.segment", {
                    segment: gameText(`segment.${t}`),
                    meters: formatInt(
                      course.segments
                        .filter((seg) => seg.type === t)
                        .reduce((sum, seg) => sum + seg.length, 0),
                    ),
                  })
                : gameText(`segment.${t}`)}
            </li>
          ))}
          <li className={s.total}>{ui("ui.course.meters", { meters: formatInt(total) })}</li>
        </ul>
      )}
    </div>
  );
}
