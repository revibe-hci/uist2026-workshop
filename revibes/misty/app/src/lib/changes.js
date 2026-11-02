// 3D remix: fine-grained edits swap a change's value in the code. The model's value
// may be written differently from the code (a whole 3D element on one line, say),
// so when the whole value is not found, swap only the space-separated parts that
// changed, such as color="#8b6cf0" -> color="#f59e0b". Returns null if nothing fits.
export function swapChangeValue(code, from, to) {
  if (from && code.includes(from)) return code.split(from).join(to);
  const a = from.split(/\s+/).filter(Boolean);
  const b = to.split(/\s+/).filter(Boolean);
  if (!a.length || a.length !== b.length) return null;
  let next = code;
  let swapped = 0;
  a.forEach((part, i) => {
    if (part === b[i] || !next.includes(part)) return;
    next = next.split(part).join(b[i]);
    swapped++;
  });
  return swapped ? next : null;
}
