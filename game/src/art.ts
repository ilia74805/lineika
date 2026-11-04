import Phaser from "phaser";
import { AIR, DIRT, STONE, WOOD, TS, Tiles, WORLD_H, WORLD_W, idx, isHouseInterior, surfaceAt } from "./world";

// Графика: тайлы и персонажи — готовые пиксельные наборы (см. assets/game/LICENSE.md).
// Рыбку и фон рисует код.

const KEY = "world";

// Детерминированный шум: одинаковые пиксели получают одинаковый оттенок.
export function hash(x: number, y: number, seed = 0): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const TILE_KEYS = { stone: "tile_stone", dirt: "tile_dirt", cave: "tile_cave" } as const;

// Мир рисуется в одну текстуру. При копании перерисовывается только небольшой участок.
export class WorldPainter {
  private canvas: Phaser.Textures.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private stone: CanvasImageSource;
  private dirt: CanvasImageSource;
  private cave: CanvasImageSource;

  constructor(scene: Phaser.Scene, private tiles: Tiles) {
    if (scene.textures.exists(KEY)) scene.textures.remove(KEY);
    this.canvas = scene.textures.createCanvas(KEY, WORLD_W * TS, WORLD_H * TS)!;
    this.ctx = this.canvas.getContext();
    this.ctx.imageSmoothingEnabled = false;
    this.stone = scene.textures.get(TILE_KEYS.stone).getSourceImage() as CanvasImageSource;
    this.dirt = scene.textures.get(TILE_KEYS.dirt).getSourceImage() as CanvasImageSource;
    this.cave = scene.textures.get(TILE_KEYS.cave).getSourceImage() as CanvasImageSource;
    for (let ty = 0; ty < WORLD_H; ty++) for (let tx = 0; tx < WORLD_W; tx++) this.paintTile(tx, ty);
    this.canvas.refresh();
    scene.add.image(0, 0, KEY).setOrigin(0, 0).setDepth(1);
  }

  // Перерисовать блок и соседей: трава и фон зависят от окружения.
  refreshAround(tx: number, ty: number): void {
    for (let y = Math.max(0, ty - 1); y <= Math.min(WORLD_H - 1, ty + 1); y++) {
      for (let x = Math.max(0, tx - 1); x <= Math.min(WORLD_W - 1, tx + 1); x++) this.paintTile(x, y);
    }
    this.canvas.refresh();
  }

  private paintTile(tx: number, ty: number): void {
    const x = tx * TS;
    const y = ty * TS;
    const t = this.tiles[idx(tx, ty)]!;
    const above = ty > 0 ? this.tiles[idx(tx, ty - 1)]! : AIR;
    const underground = ty > surfaceAt(tx);
    this.ctx.clearRect(x, y, TS, TS);

    if (t === AIR) {
      if (underground || isHouseInterior(tx, ty)) this.ctx.drawImage(this.cave, x, y, TS, TS);
      return;
    }
    if (t === STONE) this.ctx.drawImage(this.stone, x, y, TS, TS);
    else if (t === DIRT) this.ctx.drawImage(this.dirt, x, y, TS, TS);
    else if (t === WOOD) {
      // дома: камень с коричневым оттенком
      this.ctx.drawImage(this.stone, x, y, TS, TS);
      this.ctx.fillStyle = "rgba(140, 84, 40, 0.5)";
      this.ctx.fillRect(x, y, TS, TS);
    }

    // трава по верхнему краю земли, если над ним воздух
    if (t === DIRT && above === AIR) {
      for (let px = 0; px < TS; px++) {
        const h = 3 + Math.floor(hash(tx * TS + px, ty, 5) * 4);
        this.ctx.fillStyle = hash(tx * TS + px, ty, 6) < 0.5 ? "#5f9e3e" : "#4a7f30";
        this.ctx.fillRect(x + px, y, 1, h);
      }
      this.ctx.fillStyle = "#3b6a25";
      this.ctx.fillRect(x, y + 6, TS, 1);
    }
  }
}

// Фон: небо и два слоя холмов, которые двигаются медленнее камеры.
export function drawSkyAndHills(scene: Phaser.Scene): void {
  const sky = scene.add.graphics().setScrollFactor(0).setDepth(-20);
  sky.fillGradientStyle(0x5aa9f0, 0x5aa9f0, 0xcdeaff, 0xcdeaff, 1);
  sky.fillRect(0, 0, 960, 540);

  const far = scene.add.graphics().setScrollFactor(0.25).setDepth(-12);
  const near = scene.add.graphics().setScrollFactor(0.45).setDepth(-10);
  for (let x = 0; x < WORLD_W * TS; x += 6) {
    far.fillStyle(0x7fb08a);
    far.fillRect(x, 330 + Math.sin(x / 210) * 30, 6, 600);
    near.fillStyle(0x3f6e4c);
    near.fillRect(x, 390 + Math.sin(x / 140) * 20 + Math.sin(x / 57) * 6, 6, 600);
  }
}

// Пиксельный спрайт из текстового рисунка (для рыбки).
export function makeSprite(scene: Phaser.Scene, key: string, rows: string[], palette: Record<string, string>): void {
  if (scene.textures.exists(key)) return;
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const color = palette[row[x] ?? "."];
      if (!color) continue;
      const n = parseInt(color.slice(1), 16);
      const o = (y * w + x) * 4;
      img.data[o] = (n >> 16) & 255;
      img.data[o + 1] = (n >> 8) & 255;
      img.data[o + 2] = n & 255;
      img.data[o + 3] = 255;
    }
  });
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

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

export const FISH_PALETTE = { O: "#ffa34d", E: "#222222" };

// Точная коллизия: клетки, где в спрайте есть непрозрачный пиксель (с учётом масштаба).
// right — как нарисовано; left — отражённый вариант.
export type Cell = { x: number; y: number };

export type Mask = { right: Cell[]; left: Cell[]; all: Cell[] };

export function buildMask(scene: Phaser.Scene, key: string, scale: number): Mask {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const w = src.width;
  const h = src.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const right: Cell[] = [];
  const left: Cell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! === 0) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          right.push({ x: x * scale + sx, y: y * scale + sy });
          left.push({ x: (w - 1 - x) * scale + sx, y: y * scale + sy });
        }
      }
    }
  }
  // all — объединение обоих направлений: поворот спрайта не меняет коллизию
  return { right, left, all: [...right, ...left] };
}
