import { useCallback, useEffect, useState } from "react";

const AUTO_KEY = "aptc-auto-fullscreen";

/** Phones and touch-only handhelds — fullscreen is deliberately skipped there. */
export function isHandheld(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(max-width: 767px)").matches ||
    window.matchMedia("(hover: none) and (pointer: coarse)").matches
  );
}

const supported = () =>
  typeof document !== "undefined" && Boolean(document.documentElement.requestFullscreen);

/**
 * Keeps the whole app in browser fullscreen on desktop / tablet.
 * The first interaction of a session triggers it (the Fullscreen API needs a
 * user gesture); the toggle in the topbar takes over after that.
 */
export function useFullscreen() {
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    const sync = () => setIsFull(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const enter = useCallback(async () => {
    if (!supported() || document.fullscreenElement) return;
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      /* the browser refused the gesture — the toggle still works later */
    }
  }, []);

  const exit = useCallback(async () => {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      /* nothing to do */
    }
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void exit();
    else void enter();
  }, [enter, exit]);

  useEffect(() => {
    if (!supported() || isHandheld()) return;
    try {
      if (sessionStorage.getItem(AUTO_KEY) === "1") return;
      sessionStorage.setItem(AUTO_KEY, "1");
    } catch {
      return;
    }
    const cleanup = () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    function onGesture() {
      cleanup();
      void enter();
    }
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return cleanup;
  }, [enter]);

  return { isFull, enter, exit, toggle, supported: supported() };
}
