"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDb } from "@/lib/db";
import type { Composition } from "@/lib/types";

export function CompositionsRow() {
  const [comps, setComps] = useState<Composition[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getDb()
        .compositions.orderBy("updatedAt")
        .reverse()
        .limit(8)
        .toArray();
      if (!cancelled) setComps(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (comps === null) {
    return (
      <div className="flex gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="w-44 h-28 rounded-[2px] bg-canvas-deep/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  async function onDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    await getDb().compositions.delete(id);
    setComps((rows) => (rows ?? []).filter((r) => r.id !== id));
  }

  return (
    <div className="flex gap-5 overflow-x-auto pb-2 -mx-2 px-2">
      {comps.map((c) => (
        <div key={c.id} className="relative group shrink-0">
          <Link
            href={`/compose/${c.id}`}
            className="sticker-tile w-44 h-28 shrink-0 rounded-[2px] p-2 flex flex-col"
          >
            <div className="flex-1 overflow-hidden flex items-center justify-center">
              {c.thumbDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.thumbDataUrl}
                  alt={c.name}
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <span className="display-italic text-muted text-sm">
                  untitled
                </span>
              )}
            </div>
            <div className="display-italic text-[0.78rem] text-ink-soft truncate mt-1">
              {c.name}
            </div>
          </Link>
          <button
            type="button"
            onClick={(e) => onDelete(e, c.id)}
            aria-label={`delete ${c.name}`}
            className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-paper/90 border border-canvas-edge text-muted opacity-0 group-hover:opacity-100 hover:text-terracotta hover:border-terracotta transition-opacity"
          >
            ×
          </button>
        </div>
      ))}
      <Link
        href="/compose/new"
        className="tile-dashed w-44 h-28 shrink-0 rounded-[2px] flex flex-col items-center justify-center"
      >
        <span className="text-xl leading-none">＋</span>
        <span className="display-italic text-[0.85rem] mt-1">
          new composition
        </span>
      </Link>
    </div>
  );
}
