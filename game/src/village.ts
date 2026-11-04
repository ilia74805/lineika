import Phaser from "phaser";
import { Cards } from "./ui";
import { AIR, HOUSES, RUINS_X, TS, Tiles, WORLD_H, WORLD_W, generate, idx, isSolid, surfaceAt, topSolid } from "./world";
import { FISH_PALETTE, FISH_ROWS, WorldPainter, drawSkyAndHills, makeSprite } from "./art";
import { DAY_LENGTH, NIGHT_AT, SpecialistId, NpcId, state } from "./state";
import { FISH_LINES, FRIEND_HELLO, FRIEND_TELLS, NPC_LINES, NPC_NAMES, SPECIALIST_TELLS } from "./story";

const PW = 20; // ширина героя (коллизия)
const PH = 30; // высота героя (коллизия)
const REACH = 4 * TS; // радиус, в котором можно копать и ставить блоки
const TALK_DIST = 64;
const BOSS_HITS = 8;

type Npc = {
  id: NpcId;
  x: number; // левый край в пикселях
  dir: number;
  minX: number;
  maxX: number;
  body: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  gone: boolean;
};

export class Village extends Phaser.Scene {
  private tiles!: Tiles;
  private painter!: WorldPainter;
  private night!: Phaser.GameObjects.Rectangle;
  private player!: Phaser.GameObjects.Image;
  private px = 0;
  private py = 0;
  private vx = 0;
  private vy = 0;
  private onGround = false;
  private dirt = 20;
  private npcs: Npc[] = [];
  private fish!: Phaser.GameObjects.Image;
  private fishX = 0;
  private fishY = 0;
  private boss?: Phaser.GameObjects.Image;
  private bossHits = 0;
  private cards!: Cards;
  private hint!: Phaser.GameObjects.Text;
  private dayLabel!: Phaser.GameObjects.Text;
  private veil!: Phaser.GameObjects.Rectangle;
  private clue: string | null = null;
  private clueTimer = 0;
  private writing = false;
  private diaryOpen = false;
  private lastNight = false;
  private ended = false;
  private keys!: {
    A: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    W: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    Z: Phaser.Input.Keyboard.Key;
    F: Phaser.Input.Keyboard.Key;
    TAB: Phaser.Input.Keyboard.Key;
  };
  private onPointer = (p: Phaser.Input.Pointer): void => this.handlePointer(p);

  constructor() {
    super("Village");
  }

  create(): void {
    this.ended = false;
    this.writing = false;
    this.diaryOpen = false;
    this.clue = null;
    this.clueTimer = 0;
    this.bossHits = 0;
    this.boss = undefined;
    this.npcs = [];
    this.dirt = 20;

    this.tiles = generate();
    this.cameras.main.setBackgroundColor("#8fc7ff");
    this.cameras.main.setBounds(0, 0, WORLD_W * TS, WORLD_H * TS);
    drawSkyAndHills(this);
    this.painter = new WorldPainter(this, this.tiles);

    // Ландшафт и руины: метка на карте, которая видна всегда
    const ruinsTop = topSolid(this.tiles, RUINS_X + 2) * TS;
    this.add
      .text(RUINS_X * TS, ruinsTop - 26, "Руины на востоке (по легенде — чудовище)", { fontFamily: "monospace", fontSize: "11px", color: "#ffe9a8" })
      .setDepth(12);

    // Герой: в доме, на полу
    const home = HOUSES.home;
    this.px = (home + 2) * TS;
    this.py = surfaceAt(home) * TS - PH;
    this.player = this.add.image(this.px + PW / 2, this.py + PH, "hero").setOrigin(0.5, 1).setDepth(10);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    // Жители: специалисты и друг
    const specs: { id: NpcId; house: number }[] = [
      { id: "jeweler", house: HOUSES.jeweler },
      { id: "mathematician", house: HOUSES.mathematician },
      { id: "gardener", house: HOUSES.gardener },
      { id: "friend", house: HOUSES.friend },
    ];
    for (const s of specs) {
      const minX = (s.house + 7) * TS;
      const maxX = (s.house + 14) * TS;
      const body = this.add.image(minX + PW / 2, 0, "npc_" + s.id).setOrigin(0.5, 1).setDepth(9);
      const label = this.add
        .text(0, 0, NPC_NAMES[s.id], { fontFamily: "monospace", fontSize: "10px", color: "#ffffff" })
        .setOrigin(0.5, 1)
        .setDepth(11);
      const gone = state.gone.has(s.id);
      this.npcs.push({ id: s.id, x: minX, dir: 1, minX, maxX, body, label, gone });
      if (gone) {
        body.setVisible(false);
        label.setText(`${NPC_NAMES[s.id]} (ушёл)`);
      }
    }

    // Рыбка-поддержка в доме
    this.fishX = (home + 4) * TS;
    this.fishY = surfaceAt(home) * TS - 16;
    makeSprite(this, "fish", FISH_ROWS, FISH_PALETTE);
    this.fish = this.add.image(this.fishX, this.fishY, "fish").setOrigin(0, 0).setScale(2).setDepth(9);
    this.add.text(this.fishX - 4, this.fishY - 12, "Рыбка", { fontFamily: "monospace", fontSize: "10px", color: "#ffffff" }).setDepth(11);

    // Интерфейс (не двигается вместе с камерой)
    this.night = this.add.rectangle(0, 0, 960, 540, 0x0b1230, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(60).setAlpha(0);
    this.veil = this.add.rectangle(480, 270, 960, 540, 0x000000, 1).setScrollFactor(0).setDepth(200).setAlpha(0);
    this.hint = this.add.text(10, 8, "", { fontFamily: "monospace", fontSize: "12px", color: "#ffffff", backgroundColor: "#00000088" }).setScrollFactor(0).setDepth(50);
    this.dayLabel = this.add.text(950, 8, "", { fontFamily: "monospace", fontSize: "12px", color: "#ffffff", backgroundColor: "#00000088" }).setOrigin(1, 0).setScrollFactor(0).setDepth(50);
    this.cards = new Cards(this);
    this.updateHint();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ A: "A", D: "D", W: "W", E: "E", Z: "Z", F: "F", TAB: "TAB" }) as typeof this.keys;
    this.input.on("pointerdown", this.onPointer);
    this.events.once("shutdown", () => this.input.off("pointerdown", this.onPointer));
  }

  update(_time: number, delta: number): void {
    if (this.ended || this.writing) return;
    const dt = Math.min(delta, 50) / 1000;

    if (Phaser.Input.Keyboard.JustDown(this.keys.TAB)) this.toggleDiary();
    if (this.cards.active) return;

    this.clock(dt);
    if (this.ended) return;

    if (this.clue) {
      this.clueTimer -= dt;
      if (this.clueTimer <= 0) this.loseClue();
    }

    this.movePlayer(dt);
    this.walkNpcs(dt);
    this.handleKeys();
    this.placeLabels();
    this.dayLabel.setText(`День ${state.day} · ${state.dayTime >= NIGHT_AT ? "ночь" : "день"}`);
  }

  // ---------- мир и движение ----------

  private collides(x: number, y: number): boolean {
    const x0 = Math.floor(x / TS);
    const x1 = Math.floor((x + PW - 0.01) / TS);
    const y0 = Math.floor(y / TS);
    const y1 = Math.floor((y + PH - 0.01) / TS);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) if (isSolid(this.tiles, tx, ty)) return true;
    }
    return false;
  }

  private sweep(dx: number, dy: number): void {
    const axisX = dx !== 0;
    let travel = Math.abs(axisX ? dx : dy);
    const sign = Math.sign(axisX ? dx : dy);
    while (travel > 0) {
      const step = Math.min(1, travel);
      travel -= step;
      const nx = this.px + (axisX ? sign * step : 0);
      const ny = this.py + (axisX ? 0 : sign * step);
      if (this.collides(nx, ny)) {
        if (axisX) this.vx = 0;
        else {
          if (sign > 0) this.onGround = true;
          this.vy = 0;
        }
        return;
      }
      this.px = nx;
      this.py = ny;
    }
  }

  private movePlayer(dt: number): void {
    const dir = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
    this.vx = dir * 130;
    if (this.keys.W.isDown && this.onGround) {
      this.vy = -330;
      this.onGround = false;
    }
    this.vy = Math.min(this.vy + 900 * dt, 600);
    this.sweep(this.vx * dt, 0);
    this.onGround = false;
    this.sweep(0, this.vy * dt);
    this.player.setPosition(this.px + PW / 2, this.py + PH);
    this.player.setFlipX(this.vx < 0);
  }

  private inHome(): boolean {
    const tx = Math.floor((this.px + PW / 2) / TS);
    return tx >= HOUSES.home && tx <= HOUSES.home + 5;
  }

  private playerCenter(): { x: number; y: number } {
    return { x: this.px + PW / 2, y: this.py + PH / 2 };
  }

  // ---------- жители ----------

  private walkNpcs(dt: number): void {
    for (const npc of this.npcs) {
      if (npc.gone) continue;
      npc.x += npc.dir * 20 * dt;
      if (npc.x <= npc.minX) {
        npc.x = npc.minX;
        npc.dir = 1;
      }
      if (npc.x >= npc.maxX) {
        npc.x = npc.maxX;
        npc.dir = -1;
      }
    }
  }

  private placeLabels(): void {
    for (const npc of this.npcs) {
      const tx = Math.floor((npc.x + PW / 2) / TS);
      const groundTop = topSolid(this.tiles, tx) * TS;
      npc.body.setPosition(npc.x + PW / 2, groundTop);
      npc.label.setPosition(npc.x + PW / 2, groundTop - PH - 6);
    }
  }

  private nearestNpc(): Npc | null {
    const c = this.playerCenter();
    let best: Npc | null = null;
    let bestD = TALK_DIST;
    for (const npc of this.npcs) {
      const groundTop = topSolid(this.tiles, Math.floor((npc.x + PW / 2) / TS)) * TS;
      const d = Math.hypot(npc.x + PW / 2 - c.x, groundTop - PH / 2 - c.y);
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
    }
    return best;
  }

  private nearFish(): boolean {
    const c = this.playerCenter();
    return Math.hypot(this.fishX + 6 - c.x, this.fishY + 4 - c.y) < TALK_DIST;
  }

  private talk(npc: Npc): void {
    if (npc.gone) {
      this.cards.show([`${NPC_NAMES[npc.id]} больше не отвечает. Дом пуст.`]);
      return;
    }
    if (npc.id === "friend") {
      const count = ++state.friendship.friend;
      const lines = [FRIEND_HELLO[Math.min(count - 1, FRIEND_HELLO.length - 1)]!];
      const tell = count === 3 ? FRIEND_TELLS[0] : count === 5 ? FRIEND_TELLS[1] : count === 7 ? FRIEND_TELLS[2] : null;
      this.cards.show(lines);
      if (tell) this.raiseClue(tell);
      return;
    }

    const id: SpecialistId = npc.id;
    const count = ++state.friendship[id];
    const attention = ++state.attention[id];
    const lines = NPC_LINES[id];
    const shown = [lines[Math.min(count - 1, lines.length - 1)]!];
    if (attention === 2) this.raiseClue(SPECIALIST_TELLS[id]);
    if (attention >= 4) {
      state.gone.add(id);
      npc.gone = true;
      npc.body.setVisible(false);
      npc.label.setText(`${NPC_NAMES[id]} (ушёл)`);
      shown.push(`${NPC_NAMES[id]} собрал вещи. На двери табличка «Закрыто».`);
    }
    this.cards.show(shown);
  }

  // ---------- улики и дневник ----------

  private raiseClue(text: string): void {
    this.clue = text;
    this.clueTimer = 8;
    this.updateHint();
  }

  private loseClue(): void {
    this.clue = null;
    state.missedToday++;
    this.updateHint();
  }

  private writeClue(): void {
    if (!this.clue || this.writing) return;
    const text = this.clue;
    this.clue = null;
    this.clueTimer = 0;
    this.writing = true;
    this.updateHint();
    this.tweens.add({
      targets: this.veil,
      alpha: 1,
      duration: 500,
      yoyo: true,
      hold: 1000,
      onComplete: () => {
        state.diary.push(text);
        this.writing = false;
        this.updateHint();
      },
    });
  }

  private toggleDiary(): void {
    if (this.diaryOpen) {
      this.cards.close();
      this.diaryOpen = false;
      return;
    }
    if (this.cards.active) return;
    this.diaryOpen = true;
    const lines = state.diary.length > 0 ? state.diary : ["В дневнике пока пусто."];
    this.cards.show(lines, () => {
      this.diaryOpen = false;
    });
  }

  // ---------- управление ----------

  private handleKeys(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      const npc = this.nearestNpc();
      if (npc) this.talk(npc);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.F) && this.nearFish()) {
      const t = state.tense ? "T" : "C";
      const d = state.diary.length > 0 ? "D" : "N";
      const f = state.friendship.friend >= 5 ? "F" : "f";
      this.cards.show([FISH_LINES[t + d + f]!]);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.Z)) this.writeClue();
    if (!this.boss && this.px > (RUINS_X + 2) * TS && !state.bossDefeated) this.spawnBoss();
  }

  private handlePointer(p: Phaser.Input.Pointer): void {
    if (this.ended || this.cards.active || this.writing) return;
    const wx = p.worldX;
    const wy = p.worldY;

    if (p.leftButtonDown()) {
      if (this.boss && Math.hypot(wx - this.boss.x, wy - (this.boss.y - TS / 2)) < 28) {
        this.bossHits++;
        this.updateHint();
        if (this.bossHits >= BOSS_HITS) this.defeatBoss();
        return;
      }
      const tx = Math.floor(wx / TS);
      const ty = Math.floor(wy / TS);
      if (this.inReach(tx, ty) && isSolid(this.tiles, tx, ty) && ty >= 0 && ty < WORLD_H && tx >= 0 && tx < WORLD_W) {
        this.tiles[idx(tx, ty)] = AIR;
        this.dirt++;
        this.painter.refreshAround(tx, ty);
        this.updateHint();
      }
    } else if (p.rightButtonDown()) {
      const tx = Math.floor(wx / TS);
      const ty = Math.floor(wy / TS);
      if (this.dirt <= 0 || !this.inReach(tx, ty) || tx < 0 || tx >= WORLD_W || ty < 0 || ty >= WORLD_H) return;
      if (this.tiles[idx(tx, ty)] !== AIR) return;
      // нельзя ставить блок внутрь героя
      const tileX = tx * TS;
      const tileY = ty * TS;
      if (tileX < this.px + PW && tileX + TS > this.px && tileY < this.py + PH && tileY + TS > this.py) return;
      this.tiles[idx(tx, ty)] = 1;
      this.dirt--;
      this.painter.refreshAround(tx, ty);
      this.updateHint();
    }
  }

  private inReach(tx: number, ty: number): boolean {
    const c = this.playerCenter();
    return Math.hypot(tx * TS + TS / 2 - c.x, ty * TS + TS / 2 - c.y) <= REACH;
  }

  // ---------- день, ночь, концовки ----------

  private clock(dt: number): void {
    state.dayTime += dt;
    if (state.dayTime >= DAY_LENGTH) {
      state.dayTime -= DAY_LENGTH;
      state.day++;
      state.tense = state.missedToday >= 2;
      state.missedToday = 0;
      this.lastNight = false;
    }
    const night = state.dayTime >= NIGHT_AT;
    if (night && !this.lastNight) this.nightStarts();
    this.lastNight = night;
    // затемнение: плавно к вечеру, полностью ночью
    const dusk = Math.min(1, Math.max(0, (state.dayTime - (NIGHT_AT - 8)) / 8));
    this.night.setAlpha(dusk * 0.55);
  }

  private nightStarts(): void {
    if (state.friendship.friend >= 7) {
      this.end("revenge");
      return;
    }
    if (state.tense && !this.inHome()) this.end("caught");
  }

  private end(kind: string): void {
    this.ended = true;
    this.scene.start("Ending", { kind });
  }

  private spawnBoss(): void {
    const tx = RUINS_X + 8;
    const top = topSolid(this.tiles, tx) * TS;
    this.boss = this.add.image(tx * TS + TS / 2, top, "boss").setOrigin(0.5, 1).setDepth(9);
    this.add.text(tx * TS, top - 44, "Чудовище", { fontFamily: "monospace", fontSize: "10px", color: "#ffffff" }).setDepth(11);
    this.cards.show(["Чудовище из легенды. Оно стоит неподвижно и смотрит на тебя."]);
  }

  private defeatBoss(): void {
    state.bossDefeated = true;
    this.boss?.destroy();
    this.boss = undefined;
    this.end("break");
  }

  // ---------- подписи ----------

  private updateHint(): void {
    const clue = this.writing ? "записываю…" : this.clue ? `!  Z — записать: «${this.clue}»` : "";
    const boss = this.boss ? `  Удары по чудовищу: ${this.bossHits}/${BOSS_HITS}` : "";
    this.hint.setText(
      `A/D ходить · W прыжок · ЛКМ копать · ПКМ ставить (земля: ${this.dirt}) · E говорить · F рыбка · Tab дневник${boss}\n${clue}`,
    );
  }
}
