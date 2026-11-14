// 书架封面缩略图：用 sharp 在 Node 里缩，不再依赖 python3（容器里根本没有 python）
// 任何一步失败都只是"没有缩略图"，调用方会回退发原图，不影响功能。
import fs from 'fs';
import path from 'path';

let sharpModule;
async function loadSharp() {
  if (sharpModule !== undefined) return sharpModule;
  try {
    const mod = await import('sharp');
    sharpModule = mod.default || mod;
  } catch {
    sharpModule = null;
  }
  return sharpModule;
}

const MAX_WIDTH = 320;

// 已经比源图新就直接用；否则生成。返回缩略图路径或 null（表示没做成）
export async function ensureThumb(srcPath, thumbPath, maxWidth = MAX_WIDTH) {
  let srcMtime = 0;
  try { srcMtime = fs.statSync(srcPath).mtimeMs; } catch { return null; }
  try {
    if (fs.statSync(thumbPath).mtimeMs >= srcMtime) return thumbPath;
  } catch {}
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
    await sharp(srcPath)
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(thumbPath);
    return thumbPath;
  } catch {
    try { fs.rmSync(thumbPath, { force: true }); } catch {}
    return null;
  }
}
