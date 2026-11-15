/** The provisional Falconess emblem: a falcon with its wings spread (owner 2026-11-12). */
export function FalconEmblem({ className }: { className?: string | undefined }) {
  return (
    <svg className={className} viewBox="0 0 120 84" aria-hidden="true">
      <path d="M57 33 4 8l9 12-8-1 12 11-7 1 14 10-4 3 18 3 10-3z" />
      <path d="M63 33 116 8l-9 12 8-1-12 11 7 1-14 10 4 3-18 3-10-3z" />
      <path d="M52 33l8-9 8 9-2 19-6 7-6-7z" />
      <circle cx="60" cy="22" r="5.5" />
      <path d="M54 54l6 22 6-22-6 5z" />
    </svg>
  );
}
