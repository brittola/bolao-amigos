import moment from "moment";

// O dia da agenda vai de 01:00 às 01:00 do dia seguinte (igual ao back): jogos da
// madrugada (00:00–00:59) entram na noite do dia anterior.
const DAY_START_HOUR = 1;

const businessDay = (value) => moment(value).subtract(DAY_START_HOUR, "hours").startOf("day");

/** Rótulo do dia para agrupamento: "Hoje", "Amanhã" ou data formatada. */
export function dayBucket(kickoff) {
  const d = businessDay(kickoff);
  const today = businessDay(moment());
  if (d.isSame(today, "day")) return "Hoje";
  if (d.isSame(moment(today).add(1, "day"), "day")) return "Amanhã";
  return d.format("dddd, DD [de] MMM");
}
