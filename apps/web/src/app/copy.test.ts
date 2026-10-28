import { afterEach, describe, expect, it, vi } from "vitest";
import { clipboardAllowed, copyOrSelect } from "./copy";

const policy = (allowed: boolean) => ({
  allowsFeature: (f: string) => f !== "clipboard-write" || allowed,
});

describe("clipboardAllowed", () => {
  it("follows the permissions policy when the browser has one", () => {
    expect(clipboardAllowed({ permissionsPolicy: policy(false) })).toBe(false);
    expect(clipboardAllowed({ featurePolicy: policy(false) })).toBe(false);
    expect(clipboardAllowed({ featurePolicy: policy(true) })).toBe(true);
  });

  it("tries the clipboard when the browser says nothing", () => {
    expect(clipboardAllowed({})).toBe(true);
    expect(clipboardAllowed(undefined)).toBe(true);
    expect(
      clipboardAllowed({
        featurePolicy: {
          allowsFeature: () => {
            throw new Error("x");
          },
        },
      }),
    ).toBe(true);
  });
});

describe("copyOrSelect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies with the clipboard, else falls back to selecting", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", {});
    expect(await copyOrSelect("run", null)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("run");

    writeText.mockImplementationOnce(() => Promise.reject(new Error("denied")));
    expect(await copyOrSelect("run", null)).toBe("selected");
  });

  it("never calls a clipboard the permissions policy blocks", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", { featurePolicy: policy(false) });
    expect(await copyOrSelect("run", null)).toBe("selected");
    expect(writeText).not.toHaveBeenCalled();
  });
});
