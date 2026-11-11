/** Stroke icons of the phone game (the approved prototype's set). Decorative: always aria-hidden. */
const PATHS = {
  flag: "M5 21V4M5 4h12l-2.5 4 2.5 4H5",
  up: "M7 17 17 7M9 7h8v8",
  right: "M5 12h14M13 6l6 6-6 6",
  down: "M7 7l10 10M17 9v8H9",
  dup: "M6 15l6-6 6 6M6 20l6-6 6 6",
  ddown: "M6 4l6 6 6-6M6 9l6 6 6-6",
  bed: "M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 9.4a1.6 1.6 0 1 0 0.01 0",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  wrench: "M15 4a4 4 0 0 0-4.6 5.4L4 15.8 6.2 18l6.4-6.4A4 4 0 0 0 18 7l-2.4 2.4-2-2L16 5",
  dumbbell: "M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12",
  back: "M15 5l-7 7 7 7",
  menu: "M4 7h16M4 12h16M4 17h16",
  wind: "M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  cross: "M12 5a7 7 0 1 0 0.01 0M12 2v5M12 17v5M2 12h5M17 12h5",
  dive: "M3 11 21 3l-8 18-2-8z",
  screen: "M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 20h8M12 16v4",
  warn: "M12 4 2 20h20zM12 10v4.5M12 17.5v.2",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8",
  check: "M5 12l5 5 9-10",
  bolt: "M13 3 5 14h6l-1 7 8-11h-6z",
  book: "M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13",
  x: "M6 6l12 12M18 6 6 18",
  play: "M7 4l13 8-13 8z",
  skip: "M5 5l9 7-9 7zM17 5v14",
  speaker: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
  mute: "M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6",
  globe: "M12 3a9 9 0 1 0 .01 0M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  // the stats of the track card
  flame: "M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 1 2 2 3 3 3 0-3-1-5 0-8z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 .01 0",
  // the segment types of the track card
  climb: "M3 19h18M3 19 19 7",
  descent: "M3 19h18M5 7l16 12",
  jump: "M3 19h7l3-4M15 19h6M12 12c2-4 5-5 8-4",
  water: "M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0",
  curves: "M5 20c10 0 10-8 7-8s-3-8 7-8",
  canyon: "M3 5h18M3 19h18M7 12h10",
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph({
  name,
  size = 24,
  color = "currentColor",
  weight = 2.2,
  className,
}: {
  name: GlyphName;
  size?: number;
  color?: string;
  weight?: number;
  className?: string | undefined;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
