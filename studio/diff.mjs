// Word comparison preserves whitespace and never produces HTML from text.
export function diffWords(before, after) {
  const tokenize = text => String(text).match(/\S+\s*|\s+/gu) || [];
  const a = tokenize(before), b = tokenize(after), result = [];
  const add = (kind, text) => {
    if (!text) return;
    if (result.at(-1)?.kind === kind) result.at(-1).text += text;
    else result.push({ kind, text });
  };
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  add('same', a.slice(0, start).join(''));
  const left = a.slice(start, endA), right = b.slice(start, endB);
  // Long passages still get a useful bounded comparison without quadratic work.
  if (left.length * right.length > 250000) {
    add('remove', left.join('')); add('add', right.join(''));
  } else {
    const columns = right.length + 1, table = new Uint32Array((left.length + 1) * columns);
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--)
      table[i * columns + j] = left[i] === right[j] ? 1 + table[(i + 1) * columns + j + 1]
        : Math.max(table[(i + 1) * columns + j], table[i * columns + j + 1]);
    let i = 0, j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) { add('same', left[i]); i++; j++; }
      else if (i < left.length && (j === right.length || table[(i + 1) * columns + j] >= table[i * columns + j + 1])) add('remove', left[i++]);
      else add('add', right[j++]);
    }
  }
  add('same', a.slice(endA).join(''));
  return result;
}
