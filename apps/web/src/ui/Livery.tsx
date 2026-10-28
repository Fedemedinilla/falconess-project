import s from "./Livery.module.css";

export type LiveryPalette = { readonly primary: string; readonly secondary: string };

export type LiveryProps = {
  palette: LiveryPalette;
  /** The manufacturer's name, for screen readers (without it the swatch is decorative). */
  label?: string;
  size?: "sm" | "md" | "lg";
};

/** A manufacturer's livery (content `palette`): the identity of its frames and runners. */
export function Livery({ palette, label, size = "md" }: LiveryProps) {
  const className = `${s.swatch} ${s[size] ?? ""}`;
  const style = { "--livery-primary": palette.primary, "--livery-secondary": palette.secondary };
  return label === undefined ? (
    <span className={className} style={style} aria-hidden="true" />
  ) : (
    <span className={className} style={style} role="img" aria-label={label} />
  );
}
