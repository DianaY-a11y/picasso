"use client";

import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { Book } from "@/components/Book";
import { getDb } from "@/lib/db";
import type { Composition, Sticker } from "@/lib/types";

/**
 * The landing scrapbook: an open notebook with the user's stickers on the
 * left page and their compositions on the right. Each page scrolls on its
 * own, like a little browser window.
 */
export function Scrapbook({
  onCreateStickers,
  onCreateComposition,
  onOpenComposition,
}: {
  onCreateStickers: () => void;
  onCreateComposition: () => void;
  onOpenComposition: (id: string) => void;
}) {
  const [stickers, setStickers] = useState<Sticker[] | null>(null);
  const [comps, setComps] = useState<Composition[] | null>(null);

  // Live queries: pages refill on their own as the studios save new work.
  useEffect(() => {
    const db = getDb();
    const s = liveQuery(() =>
      db.stickers.orderBy("createdAt").reverse().toArray(),
    ).subscribe({ next: setStickers, error: () => setStickers([]) });
    const c = liveQuery(() =>
      db.compositions.orderBy("updatedAt").reverse().toArray(),
    ).subscribe({ next: setComps, error: () => setComps([]) });
    return () => {
      s.unsubscribe();
      c.unsubscribe();
    };
  }, []);

  async function deleteSticker(id: string) {
    await getDb().stickers.delete(id);
  }

  async function deleteComp(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    await getDb().compositions.delete(id);
  }

  const left = (
      <section className="scrapbook-page">
        <header className="scrapbook-page__head">
          <h2 className="eyebrow">stickers</h2>
          <span className="display-italic text-muted">
            fragments of things you&rsquo;ve seen
          </span>
        </header>

        <div className="scrapbook-scroll">
          {stickers === null ? null : stickers.length === 0 ? (
            <EmptyPage>
              no stickers yet. bring in an image, give it a body, and cut
              pieces of it from any side.
            </EmptyPage>
          ) : (
            <div className="sticker-sheet">
              {stickers.map((s) => (
                <StickerCut key={s.id} sticker={s} onDelete={deleteSticker} />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onCreateStickers}
          className="scrapbook-cta display-italic"
        >
          create new stickers&nbsp;→
        </button>
      </section>
  );

  const right = (
      <section className="scrapbook-page">
        <header className="scrapbook-page__head">
          <h2 className="eyebrow">compositions</h2>
          <span className="display-italic text-muted">
            what you assemble of them
          </span>
        </header>

        <div className="scrapbook-scroll">
          {comps === null ? null : comps.length === 0 ? (
            <EmptyPage>
              nothing assembled yet. once you have a few stickers, arrange
              them into something new.
            </EmptyPage>
          ) : (
            <div className="comp-sheet">
              {comps.map((c) => (
                <div
                  key={c.id}
                  className="comp-print-wrap"
                  style={{ "--tilt": `${tilt(c.id, 2.2)}deg` } as React.CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => onOpenComposition(c.id)}
                    className="comp-print w-full text-left"
                  >
                    <span className="comp-print__tape" aria-hidden />
                    <span className="comp-print__img">
                      {c.thumbDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbDataUrl} alt={c.name} />
                      ) : (
                        <span className="display-italic text-muted">untitled</span>
                      )}
                    </span>
                    <span className="comp-print__name display-italic">
                      {c.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => deleteComp(e, c.id)}
                    aria-label={`delete ${c.name}`}
                    className="scrap-delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onCreateComposition}
          className="scrapbook-cta display-italic"
        >
          create new compositions&nbsp;→
        </button>
      </section>
  );

  return (
    <div className="scrapbook-frame" role="region" aria-label="your scrapbook">
      <Book left={left} right={right} className="scrapbook" ribbon />
    </div>
  );
}

function StickerCut({
  sticker,
  onDelete,
}: {
  sticker: Sticker;
  onDelete: (id: string) => void;
}) {
  return (
    <figure
      className="sticker-cut-wrap"
      style={{ "--tilt": `${tilt(sticker.id, 7)}deg` } as React.CSSProperties}
      title={sticker.name}
    >
      <div className="sticker-cut">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sticker.thumbDataUrl} alt={sticker.name} draggable={false} />
      </div>
      <button
        type="button"
        onClick={() => onDelete(sticker.id)}
        aria-label={`delete ${sticker.name}`}
        className="scrap-delete"
      >
        ×
      </button>
    </figure>
  );
}

function EmptyPage({ children }: { children: React.ReactNode }) {
  return <p className="scrapbook-empty display-italic">{children}</p>;
}

/** A small, stable rotation derived from an id so pieces look hand-placed. */
function tilt(id: string, range: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 2 * range;
}
