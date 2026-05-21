"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDb } from "@/lib/db";
import type { Sticker } from "@/lib/types";

export function StickerGrid() {
  const [stickers, setStickers] = useState<Sticker[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getDb()
        .stickers.orderBy("createdAt")
        .reverse()
        .toArray();
      if (!cancelled) setStickers(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (stickers === null) {
    return <GridSkeleton />;
  }

  if (stickers.length === 0) {
    return <EmptyStudio />;
  }

  async function onDelete(id: string) {
    await getDb().stickers.delete(id);
    setStickers((rows) => (rows ?? []).filter((r) => r.id !== id));
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
      {stickers.map((s) => (
        <StickerTile key={s.id} sticker={s} onDelete={onDelete} />
      ))}
      <NewStickerTile />
    </div>
  );
}

function EmptyStudio() {
  return (
    <Link
      href="/upload"
      className="tile-dashed block rounded-[2px] py-20 px-10 text-center"
    >
      <div className="display-italic text-[1.7rem] text-ink-soft">
        the table is empty
      </div>
      <div className="mt-3 text-[0.85rem] text-muted leading-relaxed max-w-md mx-auto">
        Bring an image — a photograph, a sketch, anything with a shape. We will
        give it a body, and you can take pieces of it from any side.
      </div>
      <div className="mt-8 display-italic text-ochre-deep text-[0.95rem]">
        begin &nbsp;→
      </div>
    </Link>
  );
}

function StickerTile({
  sticker,
  onDelete,
}: {
  sticker: Sticker;
  onDelete: (id: string) => void;
}) {
  return (
    <figure className="sticker-tile aspect-square rounded-[2px] p-3 flex flex-col relative group">
      <button
        type="button"
        onClick={() => onDelete(sticker.id)}
        aria-label={`delete ${sticker.name}`}
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-paper/90 border border-canvas-edge text-muted opacity-0 group-hover:opacity-100 hover:text-terracotta hover:border-terracotta transition-opacity"
      >
        ×
      </button>
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sticker.thumbDataUrl}
          alt={sticker.name}
          className="max-w-full max-h-full object-contain"
        />
      </div>
      <figcaption className="display-italic text-[0.85rem] text-ink-soft mt-2 truncate">
        {sticker.name}
      </figcaption>
    </figure>
  );
}

function NewStickerTile() {
  return (
    <Link
      href="/upload"
      className="tile-dashed aspect-square rounded-[2px] flex flex-col items-center justify-center gap-2"
    >
      <span className="text-2xl leading-none">＋</span>
      <span className="display-italic text-[0.95rem]">new sticker</span>
    </Link>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-[2px] bg-canvas-deep/50 animate-pulse"
        />
      ))}
    </div>
  );
}
