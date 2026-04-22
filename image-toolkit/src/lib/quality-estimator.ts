export function computeNormalizedScores(images: Array<{ bpp: number }>): number[] {
  if (images.length === 0) return [];
  if (images.length === 1) return [0.5];

  const bpps = images.map((image) => image.bpp);
  const min = Math.min(...bpps);
  const max = Math.max(...bpps);
  const range = max - min;

  if (range === 0) return images.map(() => 0.5);

  return bpps.map((bpp) => (bpp - min) / range);
}

export function computeSmartQualities(normalizedScores: number[], slider: number): number[] {
  return normalizedScores.map((score) => Math.max(0.1, 1 - slider * (0.15 + 0.85 * score)));
}
