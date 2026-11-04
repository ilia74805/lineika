import Phaser from "phaser";
import { Cards } from "./ui";
import { ENDINGS, PROLOGUE } from "./story";
import { resetState, state } from "./state";
import { Village } from "./village";

// Загрузка картинок один раз, до первого экрана.
class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    this.load.image("tile_stone", "assets/game/tiles/stone.png");
    this.load.image("tile_dirt", "assets/game/tiles/dirt.png");
    this.load.image("tile_cave", "assets/game/tiles/cave.png");
    this.load.image("hero", "assets/game/chars/hero.png");
    this.load.image("npc_jeweler", "assets/game/chars/jeweler.png");
    this.load.image("npc_mathematician", "assets/game/chars/mathematician.png");
    this.load.image("npc_gardener", "assets/game/chars/gardener.png");
    this.load.image("npc_friend", "assets/game/chars/friend.png");
    this.load.image("boss", "assets/game/monsters/boss.png");
  }

  create(): void {
    this.scene.start("Prologue");
  }
}

class Prologue extends Phaser.Scene {
  constructor() {
    super("Prologue");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#000000");
    const cards = new Cards(this);
    cards.show(PROLOGUE, () => this.scene.start("Village"));
  }
}

class Ending extends Phaser.Scene {
  constructor() {
    super("Ending");
  }

  create(data: { kind?: string }): void {
    this.cameras.main.setBackgroundColor("#000000");
    const lines = ENDINGS[data.kind ?? "caught"] ?? ENDINGS["caught"]!;
    const cards = new Cards(this);
    cards.show(lines, () => {
      resetState();
      this.scene.start("Prologue");
    });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: "#000000",
  parent: "game",
  pixelArt: true,
  scene: [Boot, Prologue, Village, Ending],
});

// Для проверок в браузере: доступ к игре и состоянию из консоли.
Object.assign(window, { game, state: () => state });
