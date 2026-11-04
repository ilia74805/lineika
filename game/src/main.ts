import Phaser from "phaser";
import { Cards } from "./ui";
import { ENDINGS, PROLOGUE } from "./story";
import { resetState, state } from "./state";
import { Village } from "./village";

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
  scene: [Prologue, Village, Ending],
});

// Для проверок в браузере: доступ к игре и состоянию из консоли.
Object.assign(window, { game, state: () => state });
