import { cpSync, mkdirSync, rmSync } from "node:fs";
import * as esbuild from "esbuild";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: "dist/game.js",
  logLevel: "warning",
});
cpSync("index.html", "dist/index.html");
cpSync("assets/game", "dist/assets/game", { recursive: true });
console.log("game ready");
