// Мир — сетка блоков. Генерация детерминированная: один и тот же seed даёт один и тот же мир.

export const TS = 16; // размер блока в пикселях
export const WORLD_W = 180;
export const WORLD_H = 60;
export const AIR = 0;
export const DIRT = 1;
export const STONE = 2;
export const WOOD = 3;

export const HOUSES = { home: 12, jeweler: 40, mathematician: 70, gardener: 100, friend: 128 } as const;
export const RUINS_X = 158;

export type Tiles = Uint8Array;

export function idx(x: number, y: number): number {
  return y * WORLD_W + x;
}

export function surfaceAt(x: number): number {
  return 28 + Math.round(4 * Math.sin(x / 9) + 2 * Math.sin(x / 3.1));
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function isSolid(t: Tiles, x: number, y: number): boolean {
  if (x < 0 || x >= WORLD_W) return true; // границы мира — стены
  if (y < 0) return false;
  if (y >= WORLD_H) return true;
  return t[idx(x, y)] !== AIR;
}

// Первый твёрдый блок сверху в столбце. Для столбца без блоков возвращает WORLD_H.
export function topSolid(t: Tiles, x: number): number {
  for (let y = 0; y < WORLD_H; y++) if (isSolid(t, x, y)) return y;
  return WORLD_H;
}

function buildHouse(t: Tiles, x0: number): void {
  const s = surfaceAt(x0); // уровень пола
  for (let dx = 0; dx <= 5; dx++) {
    for (let dy = s - 5; dy <= s - 1; dy++) t[idx(x0 + dx, dy)] = AIR;
    t[idx(x0 + dx, s - 5)] = WOOD; // крыша
    t[idx(x0 + dx, s)] = WOOD; // пол
  }
  for (let dy = s - 4; dy <= s - 1; dy++) {
    t[idx(x0 + 5, dy)] = WOOD; // правая стена
    if (dy <= s - 3) t[idx(x0, dy)] = WOOD; // левая стена, внизу дверь
  }
}

export function generate(seed = 7): Tiles {
  const r = rng(seed);
  const t: Tiles = new Uint8Array(WORLD_W * WORLD_H);

  for (let x = 0; x < WORLD_W; x++) {
    const s = surfaceAt(x);
    for (let y = s; y < WORLD_H; y++) t[idx(x, y)] = y < s + 4 ? DIRT : STONE;
  }

  // пещеры под землёй
  for (let x = 3; x < WORLD_W - 3; x++) {
    for (let y = surfaceAt(x) + 6; y < WORLD_H - 3; y++) {
      if (r() < 0.02) {
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) t[idx(x + dx, y + dy)] = AIR;
      }
    }
  }

  // руины на востоке: каменные колонны
  for (let x = RUINS_X; x < RUINS_X + 16; x++) {
    if ((x - RUINS_X) % 4 === 0) {
      const s = surfaceAt(x);
      for (let y = s - 4; y < s; y++) t[idx(x, y)] = STONE;
    }
  }

  for (const hx of Object.values(HOUSES)) buildHouse(t, hx);
  return t;
}
