/**
 * Copy text from a click handler. The published page may refuse the clipboard (older desktop
 * apps, some embedded views): then the text is selected in its textarea for the viewer to copy.
 * Resolves to "copied" or "selected".
 */
export async function copyOrSelect(
  text: string,
  fallback: HTMLTextAreaElement | null,
): Promise<"copied" | "selected"> {
  const select = (): "selected" => {
    if (fallback) {
      fallback.focus();
      fallback.select();
    }
    return "selected";
  };
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard || typeof clipboard.writeText !== "function") return select();
  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return select();
  }
}
