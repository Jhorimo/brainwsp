// Case-insensitive "contains" match — "quiero un sistema de restaurante" fires a flow whose
// keyword is "restaurante", same forgiving behavior as the reference product this module is
// modeled after. Empty/blank keywords are ignored so a stray empty string in the list can't
// match every message.
export function matchesKeyword(triggerKeywords: string[], messageBody: string): boolean {
  const body = messageBody.trim().toLowerCase();
  if (!body) return false;
  return triggerKeywords.some((keyword) => {
    const needle = keyword.trim().toLowerCase();
    return needle.length > 0 && body.includes(needle);
  });
}
