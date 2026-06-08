import { TrendScorer } from '../TrendScorerService';

// Helper: generate a kline item
function mkKline(high: number, close = high, volume = 1000, date = '20260101') {
  return { date, open: close, close, high, low: close * 0.98, volume };
}

// Helper: generate kline array of given length with specified high values
function mkKlineWithHighs(highs: number[]): ReturnType<typeof mkKline>[] {
  return highs.map((h, i) => mkKline(h, h, 1000, `2026${String(i + 1).padStart(4, '0')}`));
}

// Helper: generate kline of N items where all highs = baseHigh except the first (most recent)
function mkUniformKline(n: number, baseHigh: number, firstHigh?: number) {
  const kline = Array.from({ length: n }, (_, i) =>
    mkKline(baseHigh, baseHigh, 1000, `2026${String(n - i).padStart(4, '0')}`)
  );
  if (firstHigh !== undefined) kline[0].high = firstHigh;
  return kline;
}

describe('TrendScorer.isHundredDayNewHigh', () => {
  // ---- Boundary: null / undefined / empty ----
  it('returns false for null input', () => {
    expect(TrendScorer.isHundredDayNewHigh(null as any)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(TrendScorer.isHundredDayNewHigh(undefined as any)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(TrendScorer.isHundredDayNewHigh([])).toBe(false);
  });

  // ---- Boundary: length < 100 ----
  it('returns false for array of length 99', () => {
    const kline = mkUniformKline(99, 10);
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(false);
  });

  it('returns false for array of length 50', () => {
    const kline = mkUniformKline(50, 10);
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(false);
  });

  // ---- Boundary: exactly 100 items ----
  it('returns true when kline[0].high equals the max high (exactly 100 items)', () => {
    const kline = mkUniformKline(100, 10, 10);
    // All highs are 10, first is also 10 => max=10, kline[0].high=10 >= 10
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(true);
  });

  // ---- Positive case: kline[0].high > all others ----
  it('returns true when first item has strictly greater high than all others', () => {
    const kline = mkUniformKline(120, 10, 15);
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(true);
  });

  // ---- Positive case: kline[0].high equals max high (tie) ----
  it('returns true when first item ties with another item for max high', () => {
    const kline = mkUniformKline(120, 10, 10);
    // Set another item to the same high as first
    kline[50].high = 10;
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(true);
  });

  // ---- Negative case: kline[0].high < max high elsewhere ----
  it('returns false when first item high is less than a later item', () => {
    const kline = mkUniformKline(120, 10, 8);
    // kline[0].high = 8, all others = 10 => max = 10, 8 < 10
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(false);
  });

  // ---- Negative case: another item has strictly greater high ----
  it('returns false when some middle item has strictly greater high', () => {
    const kline = mkUniformKline(120, 10, 10);
    kline[30].high = 20; // A middle item is the highest
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(false);
  });

  // ---- Edge: large dataset ----
  it('works correctly with 200 items where first is the highest', () => {
    const kline = mkUniformKline(200, 10, 12);
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(true);
  });

  it('works correctly with 200 items where first is NOT the highest', () => {
    const kline = mkUniformKline(200, 10, 9);
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(false);
  });

  // ---- Edge: all highs are identical ----
  it('returns true when all highs are identical (first equals max)', () => {
    const kline = mkUniformKline(150, 25.5, 25.5);
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(true);
  });

  // ---- Edge: floating point highs ----
  it('handles floating point high values correctly', () => {
    const kline = mkUniformKline(120, 10.123, 10.123);
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(true);
  });

  it('returns false with floating point when first is slightly below max', () => {
    const kline = mkUniformKline(120, 10.123, 10.122);
    expect(TrendScorer.isHundredDayNewHigh(kline)).toBe(false);
  });
});

describe('TrendScorer.toBuySignalScore', () => {
  it('maps 0 raw score to 0 (without hundred-day new high)', () => {
    const kline = mkUniformKline(120, 10, 5); // not new high
    expect(TrendScorer.toBuySignalScore(0, kline)).toBe(0);
  });

  it('maps 100 raw score to 15 (max, without new high)', () => {
    const kline = mkUniformKline(120, 10, 5); // not new high
    expect(TrendScorer.toBuySignalScore(100, kline)).toBe(15);
  });

  it('maps 50 raw score to ~7 or 8', () => {
    const kline = mkUniformKline(120, 10, 5); // not new high
    const result = TrendScorer.toBuySignalScore(50, kline);
    // 50/100 * 15 = 7.5 → rounds to 8
    expect(result).toBeGreaterThanOrEqual(7);
    expect(result).toBeLessThanOrEqual(8);
  });

  it('adds 10 bonus for hundred-day new high', () => {
    const kline = mkUniformKline(120, 10, 15); // is new high (first.high > rest)
    const baseScore = TrendScorer.toBuySignalScore(0, kline);
    // Even with 0 raw, bonus should give +10
    expect(baseScore).toBe(10);
  });

  it('caps negative raw score at 0 before normalization', () => {
    const kline = mkUniformKline(120, 10, 5);
    const result = TrendScorer.toBuySignalScore(-50, kline);
    expect(result).toBe(0);
  });

  it('caps raw score > 100 at 100 before normalization', () => {
    const kline = mkUniformKline(120, 10, 5);
    const result = TrendScorer.toBuySignalScore(150, kline);
    // 150 is clamped to 100 → 100/100 * 15 = 15
    expect(result).toBe(15);
  });

  it('returns 25 (15+10) for score=100 with new high', () => {
    const kline = mkUniformKline(120, 10, 15); // new high
    const result = TrendScorer.toBuySignalScore(100, kline);
    expect(result).toBe(25);
  });
});
