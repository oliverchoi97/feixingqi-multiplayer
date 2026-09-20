/** Pick which looping-playlist item to restore after a /song insert. */
export function resolvePlaylistResumeIndex(savedIndex, savedVideoId, playlist) {
  const list = Array.isArray(playlist) ? playlist : [];
  const fromId = savedVideoId && list.length ? list.indexOf(savedVideoId) : -1;
  if (fromId >= 0) return fromId;
  const idx = Number(savedIndex);
  if (Number.isInteger(idx) && idx >= 0) {
    return list.length ? Math.min(idx, list.length - 1) : idx;
  }
  return 0;
}
