// MediaRecorder's mp4 output is a *fragmented* MP4 (moov describes empty
// sample tables; the real samples live in moof/mdat fragments appended
// after, per ISO-BMFF's streaming-friendly design). Chrome writes the
// moov-level mvhd/tkhd/mdhd duration fields from only the first buffered
// fragment at record-start — confirmed by inspecting an actual export: a
// 7.55s recording had mvhd.duration == 0 and mdhd.duration ~= 0.07–0.11s.
// Chrome's own <video> demuxer is lenient and scans every moof to recover
// the true length (so it "looks perfect" played back in the same browser),
// but stricter players — notably Android's stock video player — trust the
// declared moov duration and truncate playback/display to that near-zero
// value, even though every sample is still physically present in the file
// (hence the file size staying the same while the played/shown length
// collapses to a few seconds). This patches those duration fields in place
// to the real, accurately-measured duration so any standards-conformant
// player reads the correct length.
interface BoxInfo { start: number; size: number; contentStart: number; contentEnd: number }

function readBox(view: DataView, offset: number, limit: number): BoxInfo | null {
  if (offset + 8 > limit) return null;
  let size = view.getUint32(offset);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    const hi = view.getUint32(offset + 8);
    const lo = view.getUint32(offset + 12);
    size = hi * 2 ** 32 + lo;
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (size < headerSize || offset + size > limit) return null;
  return { start: offset, size, contentStart: offset + headerSize, contentEnd: offset + size };
}

function boxType(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
}

function findChildBox(view: DataView, start: number, end: number, type: string): BoxInfo | null {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBox(view, offset, end);
    if (!box) return null;
    if (boxType(view, offset) === type) return box;
    offset = box.start + box.size;
  }
  return null;
}

function findAllChildBoxes(view: DataView, start: number, end: number, type: string): BoxInfo[] {
  const out: BoxInfo[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBox(view, offset, end);
    if (!box) break;
    if (boxType(view, offset) === type) out.push(box);
    offset = box.start + box.size;
  }
  return out;
}

// mvhd/mdhd share one "full box" layout: version(1)+flags(3), then
// creation/modification/timescale/duration — 4-byte fields for version 0,
// 8-byte creation/modification/duration (timescale stays 4 bytes) for
// version 1.
function readTimescale(view: DataView, box: BoxInfo): number {
  const version = view.getUint8(box.contentStart);
  return version === 0 ? view.getUint32(box.contentStart + 12) : view.getUint32(box.contentStart + 20);
}

function writeFullBoxDuration(view: DataView, box: BoxInfo, timescale: number, durationSec: number) {
  const base = box.contentStart;
  const version = view.getUint8(base);
  const units = Math.round(durationSec * timescale);
  if (version === 0) {
    view.setUint32(base + 16, units);
  } else {
    view.setUint32(base + 24, Math.floor(units / 2 ** 32));
    view.setUint32(base + 28, units >>> 0);
  }
}

// tkhd has track_ID/reserved before duration, and its duration is expressed
// in the *movie* (mvhd) timescale, not a timescale of its own.
function writeTkhdDuration(view: DataView, box: BoxInfo, movieTimescale: number, durationSec: number) {
  const base = box.contentStart;
  const version = view.getUint8(base);
  const units = Math.round(durationSec * movieTimescale);
  if (version === 0) {
    view.setUint32(base + 20, units);
  } else {
    view.setUint32(base + 28, Math.floor(units / 2 ** 32));
    view.setUint32(base + 32, units >>> 0);
  }
}

function measureAccurateDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const cleanup = () => URL.revokeObjectURL(url);
    const done = (value: number) => {
      cleanup();
      resolve(value);
    };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : NaN);
    video.onerror = () => done(NaN);
    setTimeout(() => done(NaN), 4000);
    video.src = url;
  });
}

/** Best-effort — on any parsing surprise this returns the original blob
 *  untouched rather than risk producing a corrupted file. */
export async function finalizeMp4Duration(blob: Blob): Promise<Blob> {
  try {
    const durationSec = await measureAccurateDuration(blob);
    if (!Number.isFinite(durationSec) || durationSec <= 0) return blob;

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    const moov = findChildBox(view, 0, buffer.byteLength, "moov");
    if (!moov) return blob;

    const mvhd = findChildBox(view, moov.contentStart, moov.contentEnd, "mvhd");
    if (!mvhd) return blob;

    const movieTimescale = readTimescale(view, mvhd);
    if (!movieTimescale) return blob;
    writeFullBoxDuration(view, mvhd, movieTimescale, durationSec);

    for (const trak of findAllChildBoxes(view, moov.contentStart, moov.contentEnd, "trak")) {
      const tkhd = findChildBox(view, trak.contentStart, trak.contentEnd, "tkhd");
      if (tkhd) writeTkhdDuration(view, tkhd, movieTimescale, durationSec);

      const mdia = findChildBox(view, trak.contentStart, trak.contentEnd, "mdia");
      if (!mdia) continue;
      const mdhd = findChildBox(view, mdia.contentStart, mdia.contentEnd, "mdhd");
      if (!mdhd) continue;
      const trackTimescale = readTimescale(view, mdhd);
      if (!trackTimescale) continue;
      writeFullBoxDuration(view, mdhd, trackTimescale, durationSec);
    }

    return new Blob([buffer], { type: blob.type });
  } catch {
    return blob;
  }
}
