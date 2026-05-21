import Dexie, { type Table } from "dexie";
import type { Composition, ModelAsset, Sticker, SourceImage } from "./types";

class PicassoDB extends Dexie {
  sourceImages!: Table<SourceImage, string>;
  modelAssets!: Table<ModelAsset, string>;
  stickers!: Table<Sticker, string>;
  compositions!: Table<Composition, string>;

  constructor() {
    super("picasso");
    this.version(1).stores({
      sourceImages: "id, createdAt",
      modelAssets: "id, sourceImageId, createdAt",
      stickers: "id, createdAt, sourceImageId, modelAssetId",
      compositions: "id, createdAt, updatedAt",
    });
  }
}

let _db: PicassoDB | null = null;

export function getDb(): PicassoDB {
  if (typeof window === "undefined") {
    throw new Error("getDb() must only be called on the client");
  }
  if (!_db) _db = new PicassoDB();
  return _db;
}

export function newId(): string {
  return crypto.randomUUID();
}
