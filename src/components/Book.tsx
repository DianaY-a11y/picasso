"use client";

import { useState } from "react";

/**
 * An open notebook drawn entirely in CSS: dark leather cover, two cream
 * pages curving into a stitched spine. Pass `left` and `right` for a
 * two-page spread, or `spread` for one sheet across both pages.
 *
 * With `onTurnBack`, the left page's bottom-left corner curls up; clicking
 * it turns the page back (right to left → previous page) and then calls it.
 */
export function Book({
  left,
  right,
  spread,
  className = "",
  ribbon = false,
  onTurnBack,
  turnBackLabel = "turn back a page",
  children,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  spread?: React.ReactNode;
  className?: string;
  ribbon?: boolean;
  onTurnBack?: () => void;
  turnBackLabel?: string;
  /** Extra layers positioned over the book (e.g. a close button). */
  children?: React.ReactNode;
}) {
  const [turning, setTurning] = useState(false);

  function turnBack() {
    if (turning || !onTurnBack) return;
    setTurning(true);
    window.setTimeout(onTurnBack, 650);
  }

  return (
    <div className={`book ${className}`}>
      {ribbon && <span className="book__ribbon" aria-hidden />}
      {spread !== undefined ? (
        <div className="book__spread book__spread--single">
          <div className="page page--spread">{spread}</div>
        </div>
      ) : (
        <div
          className={`book__spread ${onTurnBack ? "book__spread--turnable" : ""}`}
        >
          {onTurnBack && <div className="page book__under" aria-hidden />}
          <div
            className={`page page--left ${
              onTurnBack ? "page--curl-bl" : ""
            } ${turning ? "is-turning" : ""}`}
          >
            {left}
            {onTurnBack && <span className="page-curl-flap" aria-hidden />}
          </div>
          <div className="page page--right">{right}</div>
          {/* Outside the clipped page: clipped-away pixels take no clicks. */}
          {onTurnBack && (
            <button
              type="button"
              className="page-curl-hit"
              onClick={turnBack}
              aria-label={turnBackLabel}
              title={turnBackLabel}
            />
          )}
        </div>
      )}
      {children}
    </div>
  );
}
