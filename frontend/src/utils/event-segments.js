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

function compareDateKeys(left, right) {
  return String(left).localeCompare(String(right));
}

function normalizeEventRange(event) {
  const startDate = event.startDate ?? event.date;
  let endDate = event.endDate ?? event.date;

  if (!startDate || !endDate) {
    return null;
  }

  const normalizedStartTime = extractTimeToken(event.startTime);
  const normalizedEndTime = extractTimeToken(event.endTime, { fromEnd: true });
  const startMinutes = parseTimeToMinutes(normalizedStartTime);
  const endMinutes = parseTimeToMinutes(normalizedEndTime);

  if (compareDateKeys(endDate, startDate) < 0) {
    return null;
  }

  // Backward-compatible normalization for legacy wrapped payloads that
  // encoded cross-midnight timed events on a single date.
  if (endDate === startDate && endMinutes <= startMinutes) {
    endDate = addDaysToDateKey(startDate, 1);
  }

  return {
    startDate,
    endDate,
    startMinutes,
    endMinutes,
    normalizedStartTime,
    normalizedEndTime
  };
}

export function buildDayTimedSegments(dates, events) {
  const segmentsByDate = new Map(
    dates.map((date) => [formatDateKey(date), []])
  );

  events.forEach((event) => {
    const normalized = normalizeEventRange(event);
    if (!normalized) {
      return;
    }

    const {
      startDate,
      endDate,
      startMinutes,
      endMinutes,
      normalizedStartTime,
      normalizedEndTime
    } = normalized;

    let currentDate = startDate;
    while (compareDateKeys(currentDate, endDate) <= 0) {
      const daySegments = segmentsByDate.get(currentDate);
      if (daySegments) {
        const segmentStartMinutes = currentDate === startDate ? startMinutes : 0;
        const segmentEndMinutes = currentDate === endDate ? endMinutes : MINUTES_PER_DAY;
        if (segmentEndMinutes > segmentStartMinutes) {
          daySegments.push({
            ...event,
            startMinutes: segmentStartMinutes,
            endMinutes: segmentEndMinutes,
            startTime: normalizedStartTime,
            endTime: normalizedEndTime,
            displayStartTime: normalizedStartTime,
            displayEndTime: normalizedEndTime
          });
        }
      }

      if (currentDate === endDate) {
        break;
      }
      currentDate = addDaysToDateKey(currentDate, 1);
    }
  });

  return segmentsByDate;
}
