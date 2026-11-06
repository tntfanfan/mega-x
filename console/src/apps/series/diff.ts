/** 两版正文的逐行对比（LCS）。太长就不比，免得卡住页面。 */

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

const LIMIT = 1500;

export function lineDiff(before: string, after: string): DiffLine[] | null {
  const a = before.split("\n");
  const b = after.split("\n");
  // Common head / tail first: most edits touch a few lines in the middle.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  if (x.length > LIMIT || y.length > LIMIT) return null;

  const n = x.length, m = y.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const middle: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { middle.push({ kind: "same", text: x[i] }); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) middle.push({ kind: "del", text: x[i++] });
    else middle.push({ kind: "add", text: y[j++] });
  }
  while (i < n) middle.push({ kind: "del", text: x[i++] });
  while (j < m) middle.push({ kind: "add", text: y[j++] });

  return [
    ...a.slice(0, head).map(text => ({ kind: "same" as const, text })),
    ...middle,
    ...a.slice(a.length - tail).map(text => ({ kind: "same" as const, text })),
  ];
}

/** Long unchanged runs fold to a marker, keeping `context` lines around each change. */
export function foldDiff(lines: DiffLine[], context = 3): (DiffLine | { kind: "fold"; count: number })[] {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (DiffLine | { kind: "fold"; count: number })[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) { out.push({ kind: "fold", count: skipped }); skipped = 0; }
      out.push(l);
    } else skipped++;
  });
  if (skipped) out.push({ kind: "fold", count: skipped });
  return out;
}
