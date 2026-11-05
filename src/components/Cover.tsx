"use client";

import { useState } from "react";

/**
 * Optional art for the title page (a cut-out with a transparent background,
 * placed in /public). Left empty until we have an image we're cleared to use.
 */
const COVER_ART: { src: string; alt: string; credit?: string } | null = {
  src: "/cover-art.webp",
  alt: "Pablo Picasso, Femme au béret et à la robe quadrillée (1937), cut out as a sticker",
};

/**
 * The title page: a single sheet on the open book with the studio's idea on
 * it. Its bottom-right corner curls up now and then; clicking the corner (or
 * anywhere on the page) turns it to reveal the scrapbook.
 */
export function Cover({ onTurn }: { onTurn: () => void }) {
  const [turning, setTurning] = useState(false);

  function turn() {
    if (turning) return;
    setTurning(true);
    window.setTimeout(onTurn, 650);
  }

  return (
    <div className="cover-frame">
      <div className="book cover-book">
        {/* the next page, glimpsed under the lifted corner */}
        <div className="page cover-under" aria-hidden />

        <div
          className={`cover-sheet ${turning ? "is-turning" : ""}`}
          onClick={turn}
          role="presentation"
        >
          <div className="page cover-page">
            <span className="cover-band" aria-hidden />
            <div className="cover-content">
              <header className="cover-head">
                <div className="cover-mark">P I C A S S O</div>
              </header>

              {COVER_ART ? (
                <figure className="cover-art">
                  <span className="sticker-cut">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={COVER_ART.src} alt={COVER_ART.alt} />
                  </span>
                  {COVER_ART.credit && (
                    <figcaption className="cover-credit">{COVER_ART.credit}</figcaption>
                  )}
                </figure>
              ) : (
                <div className="cover-rule" aria-hidden />
              )}

              <p className="cover-text">
                Picasso once said: &ldquo;I paint objects as I think them, not
                as I see them.&rdquo; This reflects a deeper idea that
                existence precedes essence, meaning we create our own meaning
                and identity. This studio is a small place for making art as we
                think it, not just as we see it.
              </p>
            </div>
          </div>

          <span className="cover-curl" aria-hidden />
          <button
            type="button"
            className="cover-turn"
            onClick={(e) => {
              e.stopPropagation();
              turn();
            }}
            aria-label="turn the page to open your scrapbook"
          >
          </button>
        </div>
      </div>
    </div>
  );
}
