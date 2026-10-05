// Profile photos: stored privately in Supabase Storage (bucket "avatars",
// folder per person) and shown through short-lived signed links.
import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

const SIZE = 320;            // square, in pixels
const LINK_SECONDS = 7 * 24 * 3600;

// Centre-crop to a square and shrink, so uploads are small and fast.
export async function squareJpeg(file) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file is not an image we can read.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = source.width, h = source.height, side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.86));
}

// Signed links for everyone's photo, refreshed when someone changes theirs.
export function useAvatarUrls(members) {
  const [urls, setUrls] = useState({});
  const key = members.map(m => `${m.user_id}:${m.avatar_path || ''}`).join('|');
  useEffect(() => {
    let cancelled = false;
    const withPhoto = members.filter(m => m.avatar_path);
    if (!withPhoto.length) { setUrls({}); return; }
    supabase.storage.from('avatars').createSignedUrls(withPhoto.map(m => m.avatar_path), LINK_SECONDS).then(({ data }) => {
      if (cancelled || !data) return;
      const next = {};
      withPhoto.forEach((m, i) => { if (data[i]?.signedUrl) next[m.user_id] = data[i].signedUrl; });
      setUrls(next);
    });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}
