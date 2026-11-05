"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cover } from "@/components/Cover";
import { Scrapbook } from "@/components/Scrapbook";
import { StudioOverlay } from "@/components/StudioOverlay";
import { StickerStation } from "@/components/StickerStation";
import { newId } from "@/lib/db";

const Composer = dynamic(
  () => import("@/components/Composer").then((m) => m.Composer),
  { ssr: false },
);

type Overlay = null | { kind: "stickers" } | { kind: "compose"; id: string };

/** The URL mirrors where you are so refresh / back / links all work:
 *  /  (title page)  ·  /?p=scrapbook  ·  /?studio=stickers  ·  /?compose=<id> */
function viewFromUrl(): "cover" | "book" {
  const q = new URLSearchParams(window.location.search);
  return q.has("p") || q.has("studio") || q.has("compose") ? "book" : "cover";
}

function overlayFromUrl(): Overlay {
  const q = new URLSearchParams(window.location.search);
  if (q.get("studio") === "stickers") return { kind: "stickers" };
  const id = q.get("compose");
  if (id) return { kind: "compose", id: id === "new" ? newId() : id };
  return null;
}

function urlFor(o: Overlay): string {
  if (!o) return "/?p=scrapbook";
  return o.kind === "stickers" ? "/?studio=stickers" : `/?compose=${o.id}`;
}

export function ScrapbookHome() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [view, setView] = useState<"cover" | "book" | null>(null);
  const [busy, setBusy] = useState(false);
  // Did *we* push the current history entry? Then closing can just go back.
  const pushedRef = useRef(false);

  useEffect(() => {
    const initial = overlayFromUrl();
    setView(viewFromUrl());
    if (initial) {
      setOverlay(initial);
      window.history.replaceState(null, "", urlFor(initial));
    }
    const onPop = () => {
      pushedRef.current = false;
      setView(viewFromUrl());
      setOverlay(overlayFromUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = useCallback((o: Exclude<Overlay, null>) => {
    if (pushedRef.current) {
      window.history.replaceState(null, "", urlFor(o));
    } else {
      window.history.pushState(null, "", urlFor(o));
      pushedRef.current = true;
    }
    setBusy(false);
    setOverlay(o);
  }, []);

  const close = useCallback(() => {
    setOverlay(null);
    setBusy(false);
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", "/?p=scrapbook");
    }
  }, []);

  const openBook = useCallback(() => {
    window.history.pushState(null, "", "/?p=scrapbook");
    setView("book");
  }, []);

  const backToCover = useCallback(() => {
    window.history.pushState(null, "", "/");
    setView("cover");
  }, []);

  return (
    <>
      <div className="landing" aria-hidden={overlay ? true : undefined}>
        <header className="landing__mark select-none">
          {view === "book" ? (
            <button
              type="button"
              onClick={backToCover}
              className="landing__mark-btn"
              title="back to the title page"
            >
              P I C A S S O
            </button>
          ) : (
            <span aria-hidden>&nbsp;</span>
          )}
        </header>
        <main className="landing__stage">
          {view === "cover" && <Cover onTurn={openBook} />}
          {view === "book" && (
            <Scrapbook
              onCreateStickers={() => open({ kind: "stickers" })}
              onCreateComposition={() => open({ kind: "compose", id: newId() })}
              onOpenComposition={(id) => open({ kind: "compose", id })}
              onTurnBack={backToCover}
            />
          )}
        </main>
        <footer className="landing__foot">
          {view === "book"
            ? "\u201cI paint objects as I think them, not as I see them.\u201d"
            : "\u00a0"}
        </footer>
      </div>

      {overlay?.kind === "stickers" && (
        <StudioOverlay
          label="sticker creation station"
          onClose={close}
          canClose={!busy}
        >
          <StickerStation onClose={close} onBusyChange={setBusy} />
        </StudioOverlay>
      )}

      {overlay?.kind === "compose" && (
        <StudioOverlay label="composition studio" onClose={close}>
          <Composer
            key={overlay.id}
            id={overlay.id}
            onClose={close}
            onCreateStickers={() => open({ kind: "stickers" })}
          />
        </StudioOverlay>
      )}
    </>
  );
}
