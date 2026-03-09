function usDstBoundsUTC(year) {
  let marchCursor = new Date(Date.UTC(year, 2, 1, 7, 0, 0));
  let sundaysSeen = 0;

  while (marchCursor.getUTCMonth() === 2) {
    if (marchCursor.getUTCDay() === 0) sundaysSeen += 1;
    if (sundaysSeen === 2) break;
    marchCursor = new Date(marchCursor.getTime() + 24 * 60 * 60 * 1000);
  }

  const dstStart = new Date(
    Date.UTC(year, 2, marchCursor.getUTCDate(), 7, 0, 0)
  );

  let novemberCursor = new Date(Date.UTC(year, 10, 1, 6, 0, 0));
  while (novemberCursor.getUTCDay() !== 0) {
    novemberCursor = new Date(
      novemberCursor.getTime() + 24 * 60 * 60 * 1000
    );
  }

  const dstEnd = new Date(
    Date.UTC(year, 10, novemberCursor.getUTCDate(), 6, 0, 0)
  );

  return { dstStart, dstEnd };
}

function isUsEasternDST(timeMs) {
  const date = new Date(timeMs);
  const { dstStart, dstEnd } = usDstBoundsUTC(date.getUTCFullYear());
  return date >= dstStart && date < dstEnd;
}

export function offsetET(timeMs) {
  return isUsEasternDST(timeMs) ? 4 : 5;
}

export function minutesET(timeMs) {
  const date = new Date(timeMs);
  const offset = offsetET(timeMs);
  return ((date.getUTCHours() - offset + 24) % 24) * 60 + date.getUTCMinutes();
}

export function isSession(timeMs, session = "NYSE") {
  const day = new Date(timeMs).getUTCDay();
  if (day === 0 || day === 6) {
    if (session === "FUT") {
      const minutes = minutesET(timeMs);
      return minutes >= 18 * 60 || minutes < 17 * 60;
    }
    return false;
  }

  const minutes = minutesET(timeMs);
  if (session === "AUTO") return true;

  if (session === "FUT") {
    const maintenanceStart = 17 * 60;
    const maintenanceEnd = 18 * 60;
    return !(
      minutes >= maintenanceStart && minutes < maintenanceEnd
    );
  }

  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return minutes >= open && minutes <= close;
}

export function parseWindowsCSV(csv) {
  if (!csv) return null;
  return csv
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((windowText) => {
      const [start, end] = windowText.split("-").map((value) => value.trim());
      const [startHour, startMinute] = start.split(":").map(Number);
      const [endHour, endMinute] = end.split(":").map(Number);
      return {
        aMin: startHour * 60 + startMinute,
        bMin: endHour * 60 + endMinute,
      };
    });
}

export function inWindowsET(timeMs, windows) {
  if (!windows?.length) return true;
  const minutes = minutesET(timeMs);
  return windows.some((window) => minutes >= window.aMin && minutes <= window.bMin);
}
