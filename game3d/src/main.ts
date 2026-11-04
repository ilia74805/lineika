import * as THREE from "three";
import { DAY_LENGTH, NIGHT_AT, NpcId, SpecialistId, state } from "./state";
import { ENDINGS, FISH_LINES, FRIEND_HELLO, FRIEND_TELLS, NPC_LINES, NPC_NAMES, PROLOGUE, SPECIALIST_TELLS } from "./story";
import { AIR, DIRT, HOUSES, HZ, RUINS_X, STONE, WOOD, WX, WY, WZ, blockAt, generate, groundAt, idx, isExposed, setBlock, solidForPlayer } from "./world";

// ---------- константы ----------
const HALF = 0.3; // полуширина героя
const HEIGHT = 1.8; // рост героя
const SPEED = 4.5;
const GRAVITY = 25;
const JUMP = 8.5;
const REACH = 6;
const TALK_DIST = 3;
const BOSS_HITS = 8;
const CAM_DIST = 5.5;
const PITCH = 0.35;
const SKY_DAY = new THREE.Color(0x8fc7ff);
const SKY_NIGHT = new THREE.Color(0x0b1230);

// ---------- рендер: низкое разрешение + увеличение CSS = пиксельный вид ----------
const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(480, 270, false);
const scene = new THREE.Scene();
scene.background = SKY_DAY.clone();
const camera = new THREE.PerspectiveCamera(55, 480 / 270, 0.1, 300);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(-40, 80, 30);
scene.add(sun);
const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);

// ---------- текстуры (пиксельные, без сглаживания) ----------
const loader = new THREE.TextureLoader();
function pixelTex(url: string): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((t) => {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  });
}

type Tex = Record<string, THREE.Texture>;
let T: Tex = {};

// Трава: верх земли зелёный с неровным краем, остальное — песчаник
function makeGrassTop(dirtImg: CanvasImageSource): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(dirtImg, 0, 0, 32, 32);
  for (let x = 0; x < 32; x++) {
    const h = 5 + ((x * 7) % 4);
    for (let y = 0; y < h; y++) {
      ctx.fillStyle = (x + y) % 3 === 0 ? "#5f9e3e" : "#4a7f30";
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

// Спрайт из текстуры: всегда повёрнут к камере
function makeSprite(tex: THREE.Texture, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
  s.scale.set(size, size, 1);
  scene.add(s);
  return s;
}

// Подпись над головой жителя
function labelSprite(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 24;
  const ctx = c.getContext("2d")!;
  ctx.font = "16px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(text, 64, 17);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  s.scale.set(2.2, 0.4, 1);
  scene.add(s);
  return s;
}

// ---------- мир: блоки ----------
const blockGeo = new THREE.BoxGeometry(1, 1, 1);
let blockMeshes: THREE.InstancedMesh[] = [];
const tmp = new THREE.Matrix4();

function rebuildBlocks(): void {
  for (const m of blockMeshes) {
    scene.remove(m);
    m.dispose();
  }
  blockMeshes = [];
  const buckets: Record<number, number[]> = { [STONE]: [], [DIRT]: [], [WOOD]: [] };
  for (let z = 0; z < WZ; z++) {
    for (let y = 0; y < WY; y++) {
      for (let x = 0; x < WX; x++) {
        const v = blockAt(x, y, z);
        if (v === AIR || v < 0) continue;
        if (!isExposed(x, y, z)) continue;
        buckets[v]!.push(x, y, z);
      }
    }
  }
  const mats = {
    [STONE]: new THREE.MeshLambertMaterial({ map: T.stone }),
    [WOOD]: new THREE.MeshLambertMaterial({ map: T.wood }),
    [DIRT]: [
      new THREE.MeshLambertMaterial({ map: T.dirt }),
      new THREE.MeshLambertMaterial({ map: T.dirt }),
      new THREE.MeshLambertMaterial({ map: T.grass }),
      new THREE.MeshLambertMaterial({ map: T.dirt }),
      new THREE.MeshLambertMaterial({ map: T.dirt }),
      new THREE.MeshLambertMaterial({ map: T.dirt }),
    ],
  };
  for (const type of [STONE, DIRT, WOOD]) {
    const pos = buckets[type]!;
    const n = pos.length / 3;
    if (n === 0) continue;
    const mesh = new THREE.InstancedMesh(blockGeo, mats[type as keyof typeof mats] as THREE.Material | THREE.Material[], n);
    for (let i = 0; i < n; i++) {
      tmp.makeTranslation(pos[i * 3]! + 0.5, pos[i * 3 + 1]! + 0.5, pos[i * 3 + 2]! + 0.5);
      mesh.setMatrixAt(i, tmp);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    blockMeshes.push(mesh);
  }
}

// ---------- игрок ----------
const P = { x: 0, y: 0, z: 0, vy: 0, onGround: false };
let yaw = 0;
let dirt = 20;
const playerSprite = { s: null as THREE.Sprite | null };

function collides(x: number, y: number, z: number): boolean {
  for (let ix = Math.floor(x - HALF); ix <= Math.floor(x + HALF - 1e-6); ix++) {
    for (let iy = Math.floor(y); iy <= Math.floor(y + HEIGHT - 1e-6); iy++) {
      for (let iz = Math.floor(z - HALF); iz <= Math.floor(z + HALF - 1e-6); iz++) {
        if (solidForPlayer(ix, iy, iz)) return true;
      }
    }
  }
  return false;
}

function sweep(axis: "x" | "y" | "z", d: number): void {
  if (d === 0) return;
  const steps = Math.ceil(Math.abs(d) / 0.05);
  const s = d / steps;
  for (let i = 0; i < steps; i++) {
    const nx = P.x + (axis === "x" ? s : 0);
    const ny = P.y + (axis === "y" ? s : 0);
    const nz = P.z + (axis === "z" ? s : 0);
    if (collides(nx, ny, nz)) {
      if (axis === "y") {
        if (s < 0) P.onGround = true;
        P.vy = 0;
      }
      return;
    }
    P.x = nx;
    P.y = ny;
    P.z = nz;
  }
}

// Направления относительно камеры: вперёд — туда, куда смотрит камера
function forward(): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}
function right(): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

// ---------- жители и рыбка ----------
type Npc = { id: NpcId; x: number; minX: number; maxX: number; dir: number; sprite: THREE.Sprite; label: THREE.Sprite; gone: boolean };
let npcs: Npc[] = [];
let fishSprite: THREE.Sprite | null = null;
let fishX = 0;
let fishZ = 0;
let fishY = 0;
let bossSprite: THREE.Sprite | null = null;
let bossHits = 0;

function groundTop(x: number, z: number): number {
  return groundAt(Math.floor(x), Math.floor(z));
}

function spawnWorldActors(): void {
  npcs = [];
  for (const id of ["jeweler", "mathematician", "gardener", "friend"] as NpcId[]) {
    const hx = HOUSES[id];
    const minX = hx + 7.5;
    const maxX = hx + 14.5;
    const sprite = makeSprite(T["npc_" + id]!, 2);
    const label = labelSprite(state.gone.has(id) ? `${NPC_NAMES[id]} (ушёл)` : NPC_NAMES[id]);
    npcs.push({ id, x: minX, minX, maxX, dir: 1, sprite, label, gone: state.gone.has(id) });
  }
  const hx = HOUSES.home;
  fishX = hx + 4.5;
  fishZ = HZ + 0.5;
  fishY = groundAt(hx + 4, HZ);
  fishSprite = makeSprite(T.fish!, 1.2);
  bossSprite = makeSprite(T.boss!, 2.2);
  bossSprite.visible = false;
}

function placeActors(dt: number): void {
  for (const npc of npcs) {
    if (!npc.gone) {
      npc.x += npc.dir * 1.2 * dt;
      if (npc.x <= npc.minX) {
        npc.x = npc.minX;
        npc.dir = 1;
      }
      if (npc.x >= npc.maxX) {
        npc.x = npc.maxX;
        npc.dir = -1;
      }
    }
    const top = groundTop(npc.x, HZ + 0.5);
    npc.sprite.position.set(npc.x, top + 1, HZ + 0.5);
    npc.label.position.set(npc.x, top + 2.6, HZ + 0.5);
    npc.sprite.visible = !npc.gone;
  }
  if (fishSprite) fishSprite.position.set(fishX, fishY + 0.6, fishZ);
  if (bossSprite) bossSprite.position.set(RUINS_X + 8.5, groundTop(RUINS_X + 8, HZ) + 1.1, HZ + 0.5);
}

function nearestNpc(): Npc | null {
  let best: Npc | null = null;
  let bestD = TALK_DIST;
  for (const npc of npcs) {
    const d = Math.hypot(npc.x - P.x, npc.sprite.position.z - P.z);
    if (d < bestD) {
      bestD = d;
      best = npc;
    }
  }
  return best;
}

// ---------- интерфейс ----------
const hintEl = document.getElementById("hint")!;
const dayEl = document.getElementById("day")!;
const cardsEl = document.getElementById("cards")!;
const veilEl = document.getElementById("veil")!;

let cardQueue: string[] = [];
let cardDone: (() => void) | undefined;

function renderCard(): void {
  cardsEl.textContent = `${cardQueue[0] ?? ""}\n\n[пробел — дальше]`;
}

function showCards(lines: string[], done?: () => void): void {
  if (lines.length === 0) {
    done?.();
    return;
  }
  cardQueue = [...lines];
  cardDone = done;
  cardsEl.style.display = "block";
  renderCard();
}

function closeCards(): void {
  cardQueue = [];
  cardDone = undefined;
  cardsEl.style.display = "none";
}

function advanceCards(): void {
  if (cardQueue.length === 0) return;
  cardQueue.shift();
  if (cardQueue.length > 0) {
    renderCard();
    return;
  }
  const cb = cardDone;
  closeCards();
  cb?.();
}

let clue: string | null = null;
let clueTimer = 0;
let writing = false;
let diaryOpen = false;

function updateHint(): void {
  const clueText = writing ? "записываю…" : clue ? `!  Z — записать: «${clue}»` : "";
  const boss = bossSprite?.visible ? `  Удары по чудовищу: ${bossHits}/${BOSS_HITS}` : "";
  hintEl.textContent = `WASD ходить · пробел прыжок · ←→ камера · ЛКМ копать · ПКМ ставить (земля: ${dirt}) · E говорить · F рыбка · Tab дневник${boss}\n${clueText}`;
}

function raiseClue(text: string): void {
  clue = text;
  clueTimer = 8;
  updateHint();
}

function loseClue(): void {
  clue = null;
  state.missedToday++;
  updateHint();
}

function writeClue(): void {
  if (!clue || writing) return;
  const text = clue;
  clue = null;
  clueTimer = 0;
  writing = true;
  updateHint();
  veilEl.style.opacity = "1";
  setTimeout(() => {
    veilEl.style.opacity = "0";
    state.diary.push(text);
    writing = false;
    updateHint();
  }, 1000);
}

function toggleDiary(): void {
  if (diaryOpen) {
    closeCards();
    diaryOpen = false;
    return;
  }
  if (cardQueue.length > 0) return;
  diaryOpen = true;
  const lines = state.diary.length > 0 ? state.diary : ["В дневнике пока пусто."];
  showCards(lines, () => {
    diaryOpen = false;
  });
}

function talk(npc: Npc): void {
  if (npc.gone) {
    showCards([`${NPC_NAMES[npc.id]} больше не отвечает. Дом пуст.`]);
    return;
  }
  if (npc.id === "friend") {
    const count = ++state.friendship.friend;
    showCards([FRIEND_HELLO[Math.min(count - 1, FRIEND_HELLO.length - 1)]!]);
    const tell = count === 3 ? FRIEND_TELLS[0] : count === 5 ? FRIEND_TELLS[1] : count === 7 ? FRIEND_TELLS[2] : null;
    if (tell) raiseClue(tell);
    return;
  }
  const id = npc.id as SpecialistId;
  const count = ++state.friendship[id];
  const attention = ++state.attention[id];
  const lines = NPC_LINES[id];
  const shown = [lines[Math.min(count - 1, lines.length - 1)]!];
  if (attention === 2) raiseClue(SPECIALIST_TELLS[id]);
  if (attention >= 4) {
    state.gone.add(id);
    npc.gone = true;
    shown.push(`${NPC_NAMES[id]} собрал вещи. На двери табличка «Закрыто».`);
  }
  showCards(shown);
}

// ---------- день и ночь, концовки ----------
let lastNight = false;
let ended = false;

function end(kind: string): void {
  ended = true;
  showCards(ENDINGS[kind] ?? ENDINGS["caught"]!, () => location.reload());
}

function inHome(): boolean {
  return P.x >= HOUSES.home && P.x <= HOUSES.home + 6 && Math.abs(P.z - HZ) <= 2;
}

function clock(dt: number): void {
  state.dayTime += dt;
  if (state.dayTime >= DAY_LENGTH) {
    state.dayTime -= DAY_LENGTH;
    state.day++;
    state.tense = state.missedToday >= 2;
    state.missedToday = 0;
    lastNight = false;
  }
  const night = state.dayTime >= NIGHT_AT;
  if (night && !lastNight && !ended) {
    if (state.friendship.friend >= 7) end("revenge");
    else if (state.tense && !inHome()) end("caught");
  }
  lastNight = night;
  const dusk = Math.min(1, Math.max(0, (state.dayTime - (NIGHT_AT - 8)) / 8));
  (scene.background as THREE.Color).copy(SKY_DAY).lerp(SKY_NIGHT, dusk * 0.85);
  ambient.intensity = 0.7 - dusk * 0.4;
  sun.intensity = 0.9 - dusk * 0.7;
  dayEl.textContent = `День ${state.day} · ${night ? "ночь" : "день"}`;
}

// ---------- ввод ----------
const held = new Set<string>();
const pressed = new Set<string>();
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  held.add(e.code);
  pressed.add(e.code);
  if (e.code === "Tab" || e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
});
addEventListener("keyup", (e) => held.delete(e.code));

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  if (cardQueue.length > 0 || writing || ended) return;
  if (e.button === 0) {
    if (bossSprite?.visible && P.x > RUINS_X - 4 && Math.hypot(P.x - bossSprite.position.x, P.z - bossSprite.position.z) < 3.5) {
      bossHits++;
      updateHint();
      if (bossHits >= BOSS_HITS) defeatBoss();
      return;
    }
    const hit = castRay();
    if (hit.hit && hit.hit.v !== AIR) {
      setBlock(hit.hit.x, hit.hit.y, hit.hit.z, AIR);
      dirt++;
      rebuildBlocks();
      updateHint();
    }
  } else if (e.button === 2) {
    const hit = castRay();
    if (hit.prev && dirt > 0 && blockAt(hit.prev.x, hit.prev.y, hit.prev.z) === AIR) {
      const { x, y, z } = hit.prev;
      if (!overlapsPlayer(x, y, z)) {
        setBlock(x, y, z, DIRT);
        dirt--;
        rebuildBlocks();
        updateHint();
      }
    }
  }
});

function overlapsPlayer(bx: number, by: number, bz: number): boolean {
  return bx + 1 > P.x - HALF && bx < P.x + HALF && by + 1 > P.y && by < P.y + HEIGHT && bz + 1 > P.z - HALF && bz < P.z + HALF;
}

// Луч от головы героя в сторону взгляда камеры (алгоритм Амантидеса—Во)
function castRay(): { hit: { x: number; y: number; z: number; v: number } | null; prev: { x: number; y: number; z: number } | null } {
  const from = { x: P.x, y: P.y + 1.4, z: P.z };
  const dirV = new THREE.Vector3(-(camPos.x - P.x), -(camPos.y - (P.y + 1.4)), -(camPos.z - P.z)).normalize();
  const dir = { x: dirV.x, y: dirV.y, z: dirV.z };
  let x = Math.floor(from.x);
  let y = Math.floor(from.y);
  let z = Math.floor(from.z);
  const sx = dir.x > 0 ? 1 : -1;
  const sy = dir.y > 0 ? 1 : -1;
  const sz = dir.z > 0 ? 1 : -1;
  const dx = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const dy = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const dz = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
  let tx = dir.x > 0 ? (x + 1 - from.x) * dx : dir.x < 0 ? (from.x - x) * dx : Infinity;
  let ty = dir.y > 0 ? (y + 1 - from.y) * dy : dir.y < 0 ? (from.y - y) * dy : Infinity;
  let tz = dir.z > 0 ? (z + 1 - from.z) * dz : dir.z < 0 ? (from.z - z) * dz : Infinity;
  let prev: { x: number; y: number; z: number } | null = null;
  let t = 0;
  while (t <= REACH) {
    const v = blockAt(x, y, z);
    if (v === -1) return { hit: null, prev: null };
    if (v !== AIR) return { hit: { x, y, z, v }, prev };
    prev = { x, y, z };
    if (tx < ty && tx < tz) {
      t = tx;
      x += sx;
      tx += dx;
    } else if (ty < tz) {
      t = ty;
      y += sy;
      ty += dy;
    } else {
      t = tz;
      z += sz;
      tz += dz;
    }
  }
  return { hit: null, prev: null };
}

function defeatBoss(): void {
  state.bossDefeated = true;
  if (bossSprite) bossSprite.visible = false;
  end("break");
}

// ---------- игровой цикл ----------
const camPos = new THREE.Vector3();
const target = new THREE.Vector3();
let started = false;

function startGame(): void {
  started = true;
  // героя ставим в доме
  // на улице рядом с домом: внутри маленького дома камере некуда отойти
  P.x = HOUSES.home + 9.5;
  P.z = HZ + 0.5;
  P.y = groundAt(HOUSES.home + 9, HZ);
  P.vy = 0;
  playerSprite.s = makeSprite(T.hero!, 2.2);
  updateHint();
}

function update(dt: number): void {
  if (cardQueue.length > 0) {
    if (pressed.has("Space") || pressed.has("KeyE")) advanceCards();
    return;
  }
  if (!started || ended) return;
  if (pressed.has("Tab")) toggleDiary();
  if (pressed.has("Space") && P.onGround) {
    P.vy = JUMP;
    P.onGround = false;
  }
  if (pressed.has("KeyE")) {
    const npc = nearestNpc();
    if (npc) talk(npc);
  }
  if (pressed.has("KeyF") && Math.hypot(fishX - P.x, fishZ - P.z) < TALK_DIST) {
    const t = state.tense ? "T" : "C";
    const d = state.diary.length > 0 ? "D" : "N";
    const f = state.friendship.friend >= 5 ? "F" : "f";
    showCards([FISH_LINES[t + d + f]!]);
  }
  if (pressed.has("KeyZ")) writeClue();

  // поворот камеры стрелками
  if (held.has("ArrowLeft")) yaw += 2.2 * dt;
  if (held.has("ArrowRight")) yaw -= 2.2 * dt;

  // движение
  let mx = 0;
  let mz = 0;
  const f = forward();
  const r = right();
  const fwd = (held.has("KeyW") ? 1 : 0) - (held.has("KeyS") ? 1 : 0);
  const side = (held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0);
  mx = f.x * fwd + r.x * side;
  mz = f.z * fwd + r.z * side;
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx = (mx / len) * SPEED * dt;
    mz = (mz / len) * SPEED * dt;
  }
  sweep("x", mx);
  sweep("z", mz);
  P.vy = Math.max(P.vy - GRAVITY * dt, -30);
  P.onGround = false;
  sweep("y", P.vy * dt);
  if (P.onGround) P.y = Math.floor(P.y + 1e-3);

  // бой с чудовищем появляется у руин
  if (!state.bossDefeated && P.x > RUINS_X + 2 && bossSprite && !bossSprite.visible) {
    bossSprite.visible = true;
    showCards(["Чудовище из легенды. Оно стоит неподвижно и смотрит на тебя."]);
  }

  clock(dt);
  if (clue) {
    clueTimer -= dt;
    if (clueTimer <= 0) loseClue();
  }
  if (playerSprite.s) playerSprite.s.position.set(P.x, P.y + 1.1, P.z);
  placeActors(dt);
}

// Если между головой героя и камерой стоит блок (стена, потолок), камера подходит ближе.
function clipCameraDistance(): number {
  const cp = Math.cos(PITCH);
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    const d = (CAM_DIST * i) / steps;
    const x = target.x + Math.sin(yaw) * cp * d;
    const y = target.y + Math.sin(PITCH) * d;
    const z = target.z + Math.cos(yaw) * cp * d;
    if (blockAt(Math.floor(x), Math.floor(y), Math.floor(z)) > AIR) return Math.max(1.5, d - 0.3);
  }
  return CAM_DIST;
}

// Камера: за спиной героя на расстоянии CAM_DIST, смотрит на голову
function placeCamera(): void {
  target.set(P.x, P.y + 1.4, P.z);
  const cp = Math.cos(PITCH);
  const dist = clipCameraDistance();
  camPos.set(target.x + Math.sin(yaw) * cp * dist, target.y + Math.sin(PITCH) * dist, target.z + Math.cos(yaw) * cp * dist);
  camera.position.copy(camPos);
  camera.lookAt(target);
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  pressed.clear();
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- старт: загрузка картинок, мир, пролог ----------
async function boot(): Promise<void> {
  const grassBase = await pixelTex("assets/game/tiles/dirt.png");
  T = {
    stone: await pixelTex("assets/game/tiles/stone.png"),
    dirt: grassBase,
    wood: await pixelTex("assets/game/tiles/stone.png"),
    hero: await pixelTex("assets/game/chars/hero.png"),
    boss: await pixelTex("assets/game/monsters/boss.png"),
    npc_jeweler: await pixelTex("assets/game/chars/jeweler.png"),
    npc_mathematician: await pixelTex("assets/game/chars/mathematician.png"),
    npc_gardener: await pixelTex("assets/game/chars/gardener.png"),
    npc_friend: await pixelTex("assets/game/chars/friend.png"),
  } as Tex;
  T["grass"] = makeGrassTop(grassBase.image as CanvasImageSource);
  // дерево: доски из камня с коричневым оттенком
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(T.stone!.image as CanvasImageSource, 0, 0, 32, 32);
  ctx.fillStyle = "rgba(140, 84, 40, 0.5)";
  ctx.fillRect(0, 0, 32, 32);
  const wood = new THREE.CanvasTexture(c);
  wood.magFilter = THREE.NearestFilter;
  wood.minFilter = THREE.NearestFilter;
  T["wood"] = wood;
  T["fish"] = makeFishTexture();

  generate();
  rebuildBlocks();
  spawnWorldActors();
  showCards(PROLOGUE, () => startGame());
  requestAnimationFrame(frame);
}

// Рыбка: пиксельный спрайт из текстового рисунка
function makeFishTexture(): THREE.Texture {
  const rows = [
    "...OOOO.....",
    "..OOOOOOO...",
    ".OOOOOOOOOO.",
    "OOEOOOOOOOOO",
    ".OOOOOOOOOO.",
    "..OOOOOOO.O.",
    "...OOOO...O.",
    "............",
  ];
  const c = document.createElement("canvas");
  c.width = 12;
  c.height = 8;
  const ctx = c.getContext("2d")!;
  rows.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const ch = row[x];
      if (ch === "O") ctx.fillStyle = "#ffa34d";
      else if (ch === "E") ctx.fillStyle = "#222222";
      else continue;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

boot();
