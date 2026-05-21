export type ID = string;

export type SourceImage = {
  id: ID;
  name: string;
  createdAt: number;
  blob: Blob;
  thumbDataUrl: string;
};

export type ModelAsset = {
  id: ID;
  sourceImageId: ID;
  createdAt: number;
  // GLB / mesh blob fetched from Replicate
  meshBlob: Blob;
  // Provider info for debugging / regeneration
  provider: "replicate";
  modelVersion: string;
};

export type Sticker = {
  id: ID;
  name: string;
  createdAt: number;
  // PNG blob — a screenshot of the 3D viewer (alpha background)
  blob: Blob;
  // Origin
  sourceImageId?: ID;
  modelAssetId?: ID;
  // For quick rendering in lists
  thumbDataUrl: string;
};

export type Composition = {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  // Serialized Fabric.js canvas JSON
  canvasJson: string;
  // Preview thumbnail (PNG data URL)
  thumbDataUrl: string;
};
