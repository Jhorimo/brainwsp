export function matchesKeyword(triggerKeywords: string[], messageBody: string): boolean {
  const body = messageBody.trim().toLowerCase();
  if (!body) return false;
  return triggerKeywords.some((keyword) => {
    const needle = keyword.trim().toLowerCase();
    return needle.length > 0 && body.includes(needle);
  });
}
