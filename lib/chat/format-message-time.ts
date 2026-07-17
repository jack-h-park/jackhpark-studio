// Formats a message's wall-clock time for display. Short local time (e.g.
// "2:34 PM"); falls back to including the date when the message is not from
// today, so an older restored conversation stays unambiguous.
export function formatMessageTime(
  createdAt: number,
  now: number = Date.now(),
): string {
  const date = new Date(createdAt);
  const isSameDay = new Date(now).toDateString() === date.toDateString();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (isSameDay) return time;
  const day = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${day}, ${time}`;
}
