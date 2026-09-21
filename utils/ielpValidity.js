import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

export const normalizeIelpValidity = ({ level, released }) => {
  const normalizedLevel = String(level || "").trim();
  if (!["4", "5", "6"].includes(normalizedLevel)) throw new Error("IELP level must be 4, 5, or 6.");
  const releasedAt = dayjs.utc(released);
  if (!releasedAt.isValid()) throw new Error("A valid IELP released date is required.");
  if (normalizedLevel === "6") {
    return { level: normalizedLevel, released: releasedAt.startOf("day").toDate(), expired: null };
  }
  const validityYears = normalizedLevel === "4" ? 3 : 6;
  return {
    level: normalizedLevel,
    released: releasedAt.startOf("day").toDate(),
    expired: releasedAt.add(validityYears, "year").endOf("day").toDate(),
  };
};
