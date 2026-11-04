import Phaser from "phaser";
import { AIR, DIRT, STONE, WOOD, TS, Tiles, WORLD_H, WORLD_W, idx, surfaceAt } from "./world";

// Пиксельная графика без внешних картинок: всё рисуется кодом.

const KEY = "world";

type RGB = [number, number, number];

const PAL = {
  dirtA: [112, 82, 44] as RGB,
  dirtB: [92, 66, 35] as RGB,
  dirtC: [132, 98, 54] as RGB,
  grassA: [88, 158, 64] as RGB,
  grassB: [66, 128, 50] as RGB,
  stoneA: [112, 112, 122] as RGB,
  stoneB: [88, 88, 98] as RGB,
  stoneC: [138, 138, 148] as RGB,
  woodA: [160, 110, 60] as RGB,
  woodB: [124, 82, 44] as RGB,
  wallA: [46, 38, 56] as RGB,
  wallB: [56, 46, 66] as RGB,
};

// Детерминированный шум: один и тот же пиксель всегда получает один и тот же оттенок.
export function hash(x: number, y: number, seed = 0): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class WorldPainter {
  private canvas: Phaser.Textures.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, private tiles: Tiles) {
    if (scene.textures.exists(KEY)) scene.textures.remove(KEY);
    this.canvas = scene.textures.createCanvas(KEY, WORLD_W * TS, WORLD_H * TS)!;
    this.ctx = this.canvas.getContext();
    this.img = this.ctx.createImageData(WORLD_W * TS, WORLD_H * TS);
    for (let ty = 0; ty < WORLD_H; ty++) for (let tx = 0; tx < WORLD_W; tx++) this.paintTile(tx, ty);
    this.ctx.putImageData(this.img, 0, 0);
    this.canvas.refresh();
    this.image = scene.add.image(0, 0, KEY).setOrigin(0, 0).setDepth(1);
  }

  // Перерисовать блок и его соседей: трава и стены зависят от соседних блоков.
  refreshAround(tx: number, ty: number): void {
    const x0 = Math.max(0, tx - 1);
    const x1 = Math.min(WORLD_W - 1, tx + 1);
    const y0 = Math.max(0, ty - 1);
    const y1 = Math.min(WORLD_H - 1, ty + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.paintTile(x, y);
    this.ctx.putImageData(this.img, 0, 0, x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS);
    this.canvas.refresh();
  }

  private paintTile(tx: number, ty: number): void {
    const t = this.tiles[idx(tx, ty)]!;
    const above = ty > 0 ? this.tiles[idx(tx, ty - 1)]! : AIR;
    const underground = ty > surfaceAt(tx);
    const data = this.img.data;
    const stride = WORLD_W * TS;

    for (let py = 0; py < TS; py++) {
      for (let px = 0; px < TS; px++) {
        const gx = tx * TS + px;
        const gy = ty * TS + py;
        const n = hash(gx, gy);
        let c: RGB | null = null;

        if (t === AIR) {
          // под землёй — стена пещеры, над землёй — небо (прозрачно)
          if (underground) c = n < 0.7 ? PAL.wallA : PAL.wallB;
        } else if (t === DIRT) {
          if (above === AIR && py < 3) c = n < 0.6 ? PAL.grassA : PAL.grassB;
          else c = n < 0.12 ? PAL.dirtC : n < 0.3 ? PAL.dirtB : PAL.dirtA;
        } else if (t === STONE) {
          const crack = hash(gx >> 1, gy >> 1, 3) < 0.08 && (gx + gy) % 3 === 0;
          c = crack ? PAL.stoneB : n < 0.2 ? PAL.stoneB : n > 0.85 ? PAL.stoneC : PAL.stoneA;
        } else if (t === WOOD) {
          c = py % 5 === 0 ? PAL.woodB : n < 0.12 ? PAL.woodB : PAL.woodA;
          if (px === 0 || px === TS - 1) c = PAL.woodB;
        }

        const o = (gy * stride + gx) * 4;
        if (c) {
          data[o] = c[0];
          data[o + 1] = c[1];
          data[o + 2] = c[2];
          data[o + 3] = 255;
        } else {
          data[o + 3] = 0;
        }
      }
    }
  }
}

// Фон: небо и дальние холмы, которые двигаются медленнее камеры.
export function drawSkyAndHills(scene: Phaser.Scene): void {
  const sky = scene.add.graphics().setScrollFactor(0).setDepth(-20);
  sky.fillGradientStyle(0x5aa9f0, 0x5aa9f0, 0xcdeaff, 0xcdeaff, 1);
  sky.fillRect(0, 0, 960, 540);

  // два слоя холмов: дальний светлее, ближний темнее
  const far = scene.add.graphics().setScrollFactor(0.25).setDepth(-12);
  const near = scene.add.graphics().setScrollFactor(0.45).setDepth(-10);
  for (let x = 0; x < WORLD_W * TS; x += 6) {
    far.fillStyle(0x7fb08a);
    far.fillRect(x, 215 + Math.sin(x / 210) * 22, 6, 400);
    near.fillStyle(0x3f6e4c);
    near.fillRect(x, 245 + Math.sin(x / 140) * 14 + Math.sin(x / 57) * 4, 6, 400);
  }
}

// Пиксельный спрайт из текстового рисунка. Символы: '.' — прозрачно, остальные — из палитры.
export function makeSprite(scene: Phaser.Scene, key: string, rows: string[], palette: Record<string, string>): void {
  if (scene.textures.exists(key)) return;
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? ".";
      const color = palette[ch];
      const o = (y * w + x) * 4;
      if (!color) continue; // прозрачно
      const n = parseInt(color.slice(1), 16);
      img.data[o] = (n >> 16) & 255;
      img.data[o + 1] = (n >> 8) & 255;
      img.data[o + 2] = n & 255;
      img.data[o + 3] = 255;
    }
  });
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// Человечек 10 на 20 пикселей. Палитра задаёт цвет волос (H) и рубашки (T).
export const HUMAN_ROWS: string[] = [
  "...HHHH...",
  "..HHHHHH..",
  "..HHHHHH..",
  "..SSSSSS..",
  "..SESSES..",
  "..SSSSSS..",
  "...SSSS...",
  "..TTTTTT..",
  ".TTTTTTTT.",
  ".TTTTTTTT.",
  ".TTTTTTTT.",
  "..TTTTTT..",
  "...PPPP...",
  "...PP.PP..",
  "...PP.PP..",
  "...PP.PP..",
  "...PP.PP..",
  "..BBB.BBB.",
  "..BBB.BBB.",
  "..BBB.BBB.",
].map((r) => r.padEnd(10, "."));

export const FISH_ROWS: string[] = [
  "...OOOO.....",
  "..OOOOOOO...",
  ".OOOOOOOOOO.",
  "OOEOOOOOOOOO",
  ".OOOOOOOOOO.",
  "..OOOOOOO.O.",
  "...OOOO...O.",
  "............",
].map((r) => r.padEnd(12, "."));

export const BOSS_ROWS: string[] = [
  "....PPPP...",
  "..PPPPPPPP.",
  ".PPPPPPPPPP",
  ".PPEPPPPEPP",
  ".PPEPPPPEPP",
  ".PPPPPPPPPP",
  "PPPPPPPPPPP",
  "PPPPPPPPPPP",
  ".PPPP.PPPP.",
  ".PP.PP.PP..",
  "..P.....P..",
  "...........",
].map((r) => r.padEnd(11, "."));

export const HUMAN_PALETTES: Record<string, Record<string, string>> = {
  player: { H: "#3b2314", S: "#f0c8a0", E: "#222222", T: "#e0553a", P: "#2f4b8a", B: "#2a1a10" },
  jeweler: { H: "#7a3e9d", S: "#f0c8a0", E: "#222222", T: "#8e5cc0", P: "#3a2a4a", B: "#2a1a10" },
  mathematician: { H: "#2b2b2b", S: "#e8bb94", E: "#222222", T: "#3d7fbf", P: "#33405a", B: "#1e1e1e" },
  gardener: { H: "#c9a227", S: "#f0c8a0", E: "#222222", T: "#4f9d3a", P: "#5a4a2a", B: "#2a1a10" },
  friend: { H: "#5a3b1e", S: "#f0c8a0", E: "#222222", T: "#c0392b", P: "#2f4b8a", B: "#2a1a10" },
};

export const FISH_PALETTE = { O: "#ffa34d", E: "#222222" };
export const BOSS_PALETTE = { P: "#7a3fb0", E: "#ff4d4d" };
