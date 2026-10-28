/**
 * Copy text from a click handler. The published page may refuse the clipboard (older desktop
 * apps, some embedded views): then the text is selected in its textarea for the viewer to copy.
 * Resolves to "copied" or "selected".
 */

type PolicyLike = { allowsFeature(feature: string): boolean };

function isPolicy(x: unknown): x is PolicyLike {
  return typeof x === "object" && x !== null && "allowsFeature" in x
    ? typeof x.allowsFeature === "function"
    : false;
}

/**
 * Whether the document's permissions policy lets it write to the clipboard. Chromium says so (an
 * iframe without `allow="clipboard-write"` does not), and calling the API there only logs a
 * policy violation; other browsers do not say, and then the call is tried.
 */
export function clipboardAllowed(doc: unknown = globalThis.document): boolean {
  if (typeof doc !== "object" || doc === null) return true;
  const policy = Reflect.get(doc, "permissionsPolicy") ?? Reflect.get(doc, "featurePolicy");
  if (!isPolicy(policy)) return true;
  try {
    return policy.allowsFeature("clipboard-write");
  } catch {
    return true;
  }
}

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
  if (!clipboard || typeof clipboard.writeText !== "function" || !clipboardAllowed())
    return select();
  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return select();
  }
}

/** The last text this page copied to the clipboard, so a notice can tell a run is safe. */
let lastCopied: string | undefined;

/** Remember that `text` went to the clipboard (a selection the viewer copies is not known). */
export function markCopied(text: string): void {
  lastCopied = text;
}

/** Whether this page copied exactly `text` to the clipboard. */
export function wasCopied(text: string): boolean {
  return lastCopied === text;
}
