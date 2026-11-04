"use client";

import { useEffect, useRef } from "react";

/**
 * Full-screen dim layer that holds a studio book over the scrapbook.
 * Clicking the dimmed area (outside the book) or pressing Escape closes it.
 * A press that starts inside the book and ends outside (e.g. finishing a
 * lasso stroke past the edge) does not count as a click-out.
 */
export function StudioOverlay({
  onClose,
  canClose = true,
  label,
  children,
}: {
  onClose: () => void;
  /** When false, click-out and Escape are ignored (e.g. mid-generation). */
  canClose?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const downOnBackdrop = useRef(false);
  const canCloseRef = useRef(canClose);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    canCloseRef.current = canClose;
    onCloseRef.current = onClose;
  }, [canClose, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !canCloseRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && /input|textarea/i.test(t.tagName)) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div
      className="studio-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          downOnBackdrop.current &&
          canCloseRef.current
        ) {
          onClose();
        }
        downOnBackdrop.current = false;
      }}
    >
      <div className="studio-frame book-frame">{children}</div>
    </div>
  );
}
