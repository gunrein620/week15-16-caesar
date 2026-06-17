export const SPICY_LEVELS = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;

export type SpicyLevel = (typeof SPICY_LEVELS)[number];

export function addChips(existing: string[], raw: string): string[] {
  const additions = raw
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const result = [...existing];

  for (const addition of additions) {
    const isDuplicate = result.some(
      (chip) => chip.toLocaleLowerCase("ko-KR") === addition.toLocaleLowerCase("ko-KR")
    );

    if (!isDuplicate) {
      result.push(addition);
    }
  }

  return result;
}

export function removeChip(existing: string[], chip: string): string[] {
  return existing.filter((value) => value !== chip);
}
