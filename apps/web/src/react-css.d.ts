import "react";

declare module "react" {
  /** CSS custom properties in `style`, for colors that come from content (liveries). */
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
