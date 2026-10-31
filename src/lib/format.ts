const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

const clockFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "short",
});

export const fmtTime = (iso: string | Date) => timeFmt.format(new Date(iso));
export const fmtClock = (d: Date) => clockFmt.format(d);
export const fmtDate = (d: Date) => dateFmt.format(d);

export function relTime(iso: string | Date): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 8) return "agora";
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

/** 12.345 -> "12,3" */
export const ptNum = (v: number, digits = 1) =>
  v.toFixed(digits).replace(".", ",");

export const ptInt = (v: number) => v.toLocaleString("pt-BR");
