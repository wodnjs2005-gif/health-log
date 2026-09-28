// 프로필 사진: 휴대폰으로 찍거나 고른 사진을 가운데 정사각형으로 잘라 작은 JPEG 로 줄인다 (서버 한도 120,000자).
const SIZE = 256;
const MAX_LEN = 110_000;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // 휴대폰 사진의 회전 정보(EXIF)를 반영해서 연다
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** 사진 파일 → 'data:image/jpeg;base64,…' (256×256). 사진이 아니면 오류 */
export async function toProfilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not image');
  const img = await decode(file);
  const w = img.width;
  const h = img.height;
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  if ('close' in img) img.close();
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= MAX_LEN) return url;
  }
  throw new Error('too big');
}
