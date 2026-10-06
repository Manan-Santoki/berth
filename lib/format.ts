export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[i]}`;
}

export function shortDigest(d: string | null | undefined, len = 12): string {
  if (!d) return "—";
  const [, hex = d] = d.split(":");
  return hex.slice(0, len);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "—";
  const t = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(t) || t <= 0) return "—";
  const s = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(s / 86_400), "day");
  if (abs < 86_400 * 365) return rtf.format(Math.round(s / (86_400 * 30)), "month");
  return rtf.format(Math.round(s / (86_400 * 365)), "year");
}

export function formatDate(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "—";
  const t = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(t) || t <= 0) return "—";
  return new Date(t).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en").format(n);
}

/** URL path for a repository; segments are encoded individually so `/` stays a separator. */
export function repoHref(repo: string): string {
  return `/repositories/${repo.split("/").map(encodeURIComponent).join("/")}`;
}

export function tagHref(repo: string, tag: string): string {
  return `/images/${repo.split("/").map(encodeURIComponent).join("/")}/${encodeURIComponent(tag)}`;
}
