const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function extractTimeToken(value, { fromEnd = false } = {}) {
  const matches = String(value ?? "").match(/\b\d{2}:\d{2}\b/g);
  if (!matches || matches.length === 0) {
    return "00:00";
  }
  return fromEnd ? matches[matches.length - 1] : matches[0];
}

function parseTimeToMinutes(timeValue) {
  const [hours, minutes] = String(timeValue ?? "00:00").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return Math.max(0, Math.min(MINUTES_PER_DAY, hours * MINUTES_PER_HOUR + minutes));
}

function formatDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export function buildDayTimedSegments(dates, events) {
  const segmentsByDate = new Map(
    dates.map((date) => [formatDateKey(date), []])
  );

  events.forEach((event) => {
    const normalizedStartTime = extractTimeToken(event.startTime);
    const normalizedEndTime = extractTimeToken(event.endTime, { fromEnd: true });
    const startMinutes = parseTimeToMinutes(normalizedStartTime);
    const endMinutes = parseTimeToMinutes(normalizedEndTime);
    const isCrossMidnight = endMinutes < startMinutes;
    const daySegments = segmentsByDate.get(event.date);

    if (!isCrossMidnight) {
      if (daySegments) {
        daySegments.push({
          ...event,
          startMinutes,
          endMinutes,
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          displayStartTime: normalizedStartTime,
          displayEndTime: normalizedEndTime
        });
      }
      return;
    }

    if (daySegments) {
      daySegments.push({
        ...event,
        startMinutes,
        endMinutes: MINUTES_PER_DAY,
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        displayStartTime: normalizedStartTime,
        displayEndTime: normalizedEndTime
      });
    }

    const nextDateKey = addDaysToDateKey(event.date, 1);
    const nextDaySegments = segmentsByDate.get(nextDateKey);
    if (nextDaySegments && endMinutes > 0) {
      nextDaySegments.push({
        ...event,
        startMinutes: 0,
        endMinutes,
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        displayStartTime: normalizedStartTime,
        displayEndTime: normalizedEndTime
      });
    }
  });

  return segmentsByDate;
}
