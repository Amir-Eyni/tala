"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function getStandaloneSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function subscribeToStandaloneStatus(onChange) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const displayMode = window.matchMedia("(display-mode: standalone)");
  displayMode.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);

  return () => {
    displayMode.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}

function getServerStandaloneSnapshot() {
  return null;
}

function isIosDevice() {
  return (
    /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1)
  );
}

export default function InstallPrompt() {
  const standaloneStatus = useSyncExternalStore(
    subscribeToStandaloneStatus,
    getStandaloneSnapshot,
    getServerStandaloneSnapshot,
  );
  const [installEvent, setInstallEvent] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallEvent(event);
    }

    function handleAppInstalled() {
      setInstallEvent(null);
      setShowInstructions(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!showInstructions) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setShowInstructions(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showInstructions]);

  async function handleInstallClick() {
    if (!installEvent) {
      setShowInstructions(true);
      return;
    }

    try {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      setInstallEvent(null);
      if (outcome === "accepted") {
        setShowInstructions(false);
      }
    } catch (error) {
      console.error("Native app installation prompt failed.", error);
      setInstallEvent(null);
      setShowInstructions(true);
    }
  }

  if (standaloneStatus !== false) {
    return null;
  }

  function openInstructions() {
    setIsIos(isIosDevice());
    setShowInstructions(true);
  }

  return (
    <>
      <button
        className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-brand/50 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:text-sm"
        onClick={installEvent ? handleInstallClick : openInstructions}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="size-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        نصب وب‌اپ
      </button>

      {showInstructions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowInstructions(false);
            }
          }}
        >
          <section
            aria-labelledby="install-instructions-title"
            aria-modal="true"
            className="w-full max-w-md rounded-hero border border-line bg-surface p-5 text-right shadow-2xl sm:p-6"
            role="dialog"
          >
            <h2
              className="text-lg font-bold text-text sm:text-xl"
              id="install-instructions-title"
            >
              افزودن وب‌اپ به صفحه اصلی
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              {isIos
                ? "برای نصب وب‌اپ در آیفون یا آیپد، این مراحل را در سافاری انجام دهید:"
                : "برای نصب وب‌اپ، منوی مرورگر را باز کنید و این مراحل را انجام دهید:"}
            </p>

            {isIos ? (
              <ol className="mt-4 list-inside list-decimal space-y-3 text-sm leading-7 text-text marker:font-bold marker:text-brand">
                <li>
                  در نوار پایین سافاری روی دکمه <strong>Share</strong> (مربع با
                  فلش رو به بالا) بزنید.
                </li>
                <li>
                  در منوی بازشده، گزینه <strong>Add to Home Screen</strong> را
                  انتخاب کنید.
                </li>
                <li>
                  در گوشه بالا روی <strong>Add</strong> بزنید.
                </li>
              </ol>
            ) : (
              <ol className="mt-4 list-inside list-decimal space-y-3 text-sm leading-7 text-text marker:font-bold marker:text-brand">
                <li>
                  روی آیکون سه‌نقطه در گوشه بالای مرورگر کروم بزنید.
                </li>
                <li>
                  گزینه <strong>Install app</strong> یا{" "}
                  <strong>Add to Home screen</strong> را انتخاب کنید.
                </li>
              </ol>
            )}

            <button
              autoFocus
              className="mt-6 min-h-10 rounded-control bg-brand px-4 py-2 text-sm font-bold text-on-brand transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => setShowInstructions(false)}
              type="button"
            >
              متوجه شدم / بستن
            </button>
          </section>
        </div>
      )}
    </>
  );
}
