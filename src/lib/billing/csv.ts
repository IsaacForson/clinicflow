/** CSV cell; values starting with = + - @ are prefixed with ' so spreadsheets don't run them as formulas. */
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
export const amt = (minor: number) => (minor / 100).toFixed(2);

export const csvResponse = (rows: unknown[][], filename: string) => new Response(toCsv(rows), {
  headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`, "Cache-Control": "private, no-store" },
});
