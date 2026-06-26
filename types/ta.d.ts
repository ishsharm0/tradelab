// types/ta.d.ts
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export function ema(values: number[], period?: number): number[];
export function atr(bars: Candle[], period?: number): (number | undefined)[];
export function rsi(closes: number[], period?: number): (number | undefined)[];
export function macd(
  closes: number[],
  fast?: number,
  slow?: number,
  signalPeriod?: number
): { macd: number[]; signal: number[]; histogram: number[] };
export function stochastic(
  bars: Candle[],
  kPeriod?: number,
  dPeriod?: number
): { k: (number | undefined)[]; d: (number | undefined)[] };
export function bollinger(
  closes: number[],
  period?: number,
  mult?: number
): { middle: (number | undefined)[]; upper: (number | undefined)[]; lower: (number | undefined)[] };
export function donchian(
  bars: Candle[],
  period?: number
): { upper: (number | undefined)[]; lower: (number | undefined)[]; middle: (number | undefined)[] };
export function keltner(
  bars: Candle[],
  emaPeriod?: number,
  atrPeriod?: number,
  mult?: number
): { upper: (number | undefined)[]; lower: (number | undefined)[]; middle: (number | undefined)[] };
export function supertrend(
  bars: Candle[],
  period?: number,
  mult?: number
): { line: (number | undefined)[]; direction: (number | undefined)[] };
export function vwap(bars: Candle[]): (number | undefined)[];
