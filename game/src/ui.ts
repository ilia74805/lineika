import Phaser from "phaser";

// Текстовые карточки внизу экрана. Пробел — дальше. Текст не вводится игроком.
export class Cards {
  private bg: Phaser.GameObjects.Rectangle;
  private text: Phaser.GameObjects.Text;
  private queue: string[] = [];
  private onDone?: () => void;
  private onKey = (): void => this.advance();

  constructor(private scene: Phaser.Scene) {
    this.bg = scene.add.rectangle(480, 470, 900, 120, 0x000000, 0.88).setScrollFactor(0).setDepth(100).setVisible(false);
    this.text = scene.add
      .text(40, 422, "", { fontFamily: "monospace", fontSize: "18px", color: "#f2efe6", wordWrap: { width: 860 } })
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false);
    scene.input.keyboard?.on("keydown-SPACE", this.onKey);
    scene.events.once("shutdown", () => scene.input.keyboard?.off("keydown-SPACE", this.onKey));
  }

  get active(): boolean {
    return this.bg.visible;
  }

  show(lines: string[], onDone?: () => void): void {
    if (lines.length === 0) {
      onDone?.();
      return;
    }
    this.queue = [...lines];
    this.onDone = onDone;
    this.render();
    this.setVisible(true);
  }

  advance(): void {
    if (!this.active) return;
    this.queue.shift();
    if (this.queue.length > 0) {
      this.render();
      return;
    }
    const cb = this.onDone;
    this.close();
    cb?.();
  }

  // Закрыть без вызова onDone (например, дневник по Tab).
  close(): void {
    this.queue = [];
    this.onDone = undefined;
    this.setVisible(false);
  }

  private render(): void {
    this.text.setText(`${this.queue[0] ?? ""}\n\n[пробел — дальше]`);
  }

  private setVisible(v: boolean): void {
    this.bg.setVisible(v);
    this.text.setVisible(v);
  }
}
