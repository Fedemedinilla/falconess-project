import { Component, type ErrorInfo, type ReactNode } from "react";
import { rawText } from "../content/load";
import s from "./CrashBoundary.module.css";
import { routeHref } from "./route";

type Props = { children: ReactNode };
type State = { error: Error | undefined };

/**
 * Last resort for a rendering error. Its texts come straight from es.json (the content index may
 * be what failed), with the key as a fallback so the screen never stays blank.
 */
export class CrashBoundary extends Component<Props, State> {
  override state: State = { error: undefined };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const t = (key: string) => rawText(key) ?? key;
    return (
      <div className={s.crash} role="alert">
        <h1 className={s.title}>{t("ui.crash.title")}</h1>
        <p>{t("ui.crash.body")}</p>
        <pre className={s.detail}>{error.message}</pre>
        <a className={s.link} href={routeHref("inicio")} onClick={() => window.location.reload()}>
          {t("ui.crash.reload")}
        </a>
      </div>
    );
  }
}
