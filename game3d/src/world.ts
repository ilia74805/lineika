// Трёхмерный мир из блоков 1×1×1. Y — вверх, X и Z — по земле.
// Генерация детерминированная: один и тот же мир при каждом запуске.

export const WX = 180;
export const WY = 60;
export const WZ = 40;
export const AIR = 0;
export const DIRT = 1;
export const STONE = 2;
export const WOOD = 3;

export const HOUSES = { home: 12, jeweler: 40, mathematician: 70, gardener: 100, friend: 128 } as const;
export const HZ = 20; // ряд домов по Z
export const RUINS_X = 158;

const tiles = new Uint8Array(WX * WY * WZ);

export function idx(x: number, y: number, z: number): number {
  return (z * WY + y) * WX + x;
}

function baseHeight(x: number, z: number): number {
  return 28 + Math.round(4 * Math.sin(x / 9) + 2 * Math.sin(x / 3.1)) + Math.round(1.5 * Math.sin(z / 4));
}

function houseAt(x: number, z: number): number | null {
  for (const hx of Object.values(HOUSES)) {
    if (x >= hx && x <= hx + 5 && Math.abs(z - HZ) <= 2) return hx;
  }
  return null;
}

// Высота поверхности: сколько слоёв блоков снизу. Под домом поверхность ровная.
export function groundAt(x: number, z: number): number {
  const hx = houseAt(x, z);
  return hx !== null ? baseHeight(hx, HZ) : baseHeight(x, z);
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function generate(): void {
  for (let z = 0; z < WZ; z++) {
    for (let x = 0; x < WX; x++) {
      const h = groundAt(x, z);
      const hx = houseAt(x, z);
      const ruin = x >= RUINS_X && x < RUINS_X + 16 && (x - RUINS_X) % 4 === 0 && Math.abs(z - HZ) <= 2;
      for (let y = 0; y < WY; y++) {
        let v = y < h - 4 ? STONE : y < h ? DIRT : AIR;
        if (v !== AIR && y < h - 6 && hash3(x, y, z) < 0.015) v = AIR; // пещеры
        if (hx !== null) {
          const dx = x - hx;
          const dz = z - HZ;
          if (y === h - 1) v = WOOD; // пол
          else if (y >= h && y <= h + 3) {
            v = AIR;
            const wall = dx === 0 || dx === 5 || dz === -2 || dz === 2;
            const door = dx === 0 && dz === 0 && y <= h + 1;
            if (wall && !door) v = WOOD;
          } else if (y === h + 4) v = WOOD; // крыша
        }
        if (ruin && y >= h && y <= h + 3) v = STONE;
        tiles[idx(x, y, z)] = v;
      }
    }
  }
}

export function blockAt(x: number, y: number, z: number): number {
  if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return -1;
  return tiles[idx(x, y, z)]!;
}

export function setBlock(x: number, y: number, z: number, v: number): void {
  tiles[idx(x, y, z)] = v;
}

// Для игрока: за пределами мира — стена, над миром — воздух.
export function solidForPlayer(x: number, y: number, z: number): boolean {
  if (x < 0 || x >= WX || z < 0 || z >= WZ || y < 0) return true;
  if (y >= WY) return false;
  return tiles[idx(x, y, z)] !== AIR;
}

// Блок видно, если хотя бы одна соседняя клетка — воздух.
export function isExposed(x: number, y: number, z: number): boolean {
  const n = [
    [x + 1, y, z],
    [x - 1, y, z],
    [x, y + 1, z],
    [x, y - 1, z],
    [x, y, z + 1],
    [x, y, z - 1],
  ];
  return n.some(([a, b, c]) => {
    if (a! < 0 || a! >= WX || b! < 0 || b! >= WY || c! < 0 || c! >= WZ) return false;
    return tiles[idx(a!, b!, c!)] === AIR;
  });
}
