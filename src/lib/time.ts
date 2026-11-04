// Utilitarios de tempo no fuso de Brasilia (UTC-3, sem horario de verao)

const SP_OFFSET_MS = 3 * 3600_000;

/** Inicio do dia (00:00) em Sao Paulo, deslocado por `offsetDays` */
export function startOfSpDay(offsetDays = 0): Date {
  const s = new Date(Date.now() - SP_OFFSET_MS);
  return new Date(
    Date.UTC(
      s.getUTCFullYear(),
      s.getUTCMonth(),
      s.getUTCDate() + offsetDays,
      0,
      0,
      0,
    ) + SP_OFFSET_MS,
  );
}
