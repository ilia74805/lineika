import { cpSync, mkdirSync, rmSync } from "node:fs";
import * as esbuild from "esbuild";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await esbuild.build({
  entryPoints: {
    content: "src/content.ts",
    panel: "src/panel.ts",
    background: "src/background.ts",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  outdir: "dist",
  legalComments: "none",
});

cpSync("manifest.json", "dist/manifest.json");
cpSync("sidepanel.html", "dist/sidepanel.html");
cpSync("sidepanel.css", "dist/sidepanel.css");
console.log("dist ready");
