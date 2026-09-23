// Enforces the layer rules in CLAUDE.md by scanning import statements.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = "src";
const ALLOWED = {
  data: ["data"],
  sim: ["data", "sim"],
  render: ["data", "sim", "render"],
  platform: ["data", "platform"],
  ui: ["data", "sim", "render", "ui", "platform"],
};
const BANNED_PKGS = { data: ["react", "react-dom"], sim: ["react", "react-dom"], render: ["react", "react-dom"], platform: ["react", "react-dom"] };

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f)) files.push(p);
  }
})(ROOT);

const errors = [];
for (const file of files) {
  const layer = relative(ROOT, file).split(sep)[0];
  if (!ALLOWED[layer]) continue;
  const src = readFileSync(file, "utf8");
  if (layer === "sim" && /\b(window|document|localStorage|requestAnimationFrame|performance)\b\./.test(src))
    errors.push(`${file}: sim/ must not touch browser globals`);
  if (layer === "sim" && /\bMath\.random\b|\bDate\.now\b|\bnew Date\(/.test(src))
    errors.push(`${file}: sim/ must use named RNG streams and the sim clock (no Math.random, Date.now, new Date)`);
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1] || m[2];
    if (spec.startsWith(".")) {
      const target = relative(ROOT, join(file, "..", spec)).split(sep)[0];
      if (ALLOWED[target] && !ALLOWED[layer].includes(target)) errors.push(`${file}: ${layer}/ may not import ${target}/ (${spec})`);
    } else if ((BANNED_PKGS[layer] || []).some((p) => spec === p || spec.startsWith(p + "/"))) {
      errors.push(`${file}: ${layer}/ may not import ${spec}`);
    }
  }
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`boundaries ok (${files.length} files)`);
