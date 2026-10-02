"use client";

/**
 * Chart screenshots come in at whatever the user's monitor is — 1998x1080,
 * 3840x2160, sometimes a phone grab. They are kept as data URLs so a slide
 * survives a re-render without a blob-URL lifetime to manage, and only
 * downsized when they are far larger than the 1080px export width, since
 * re-encoding a chart softens the price text on the axis.
 */

const MAX_INTAKE_DIM = 2600;
const JPEG_QUALITY = 0.92;

export interface IntakeResult {
  src: string;
  width: number;
  height: number;
  name: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Not a readable image"));
    img.src = src;
  });
}

export async function intakeImageFile(file: File): Promise<IntakeResult | null> {
  if (!file.type.startsWith("image/")) return null;
  const raw = await readAsDataUrl(file);
  const img = await decode(raw);

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= MAX_INTAKE_DIM) {
    return { src: raw, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
  }

  const k = MAX_INTAKE_DIM / longest;
  const w = Math.round(img.naturalWidth * k);
  const h = Math.round(img.naturalHeight * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { src: raw, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return { src: canvas.toDataURL("image/jpeg", JPEG_QUALITY), width: w, height: h, name: file.name };
}

/** Reads a drop / picker selection, skipping anything that isn't a decodable image. */
export async function intakeImageFiles(files: File[]): Promise<IntakeResult[]> {
  const out: IntakeResult[] = [];
  for (const file of files) {
    try {
      const result = await intakeImageFile(file);
      if (result) out.push(result);
    } catch {
      // A single unreadable file shouldn't abort the rest of the batch.
    }
  }
  return out;
}
