import type { StoredPhoto } from '../core/store.ts';

/** Longest edge we keep. Enough to read a bay number, small enough to store comfortably. */
const MAX_EDGE = 1600;

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall through to the <img> path below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** Downscales the chosen picture to a JPEG that is stored on the phone. Nothing is uploaded anywhere. */
export async function preparePhoto(file: Blob): Promise<StoredPhoto> {
  const decoded = await decode(file);
  try {
    if (decoded.width === 0 || decoded.height === 0) throw new Error('empty image');
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('encoding failed');
    return { type: 'image/jpeg', bytes: await blob.arrayBuffer() };
  } finally {
    decoded.release();
  }
}

export function photoToUrl(photo: StoredPhoto): string {
  return URL.createObjectURL(new Blob([photo.bytes], { type: photo.type }));
}
