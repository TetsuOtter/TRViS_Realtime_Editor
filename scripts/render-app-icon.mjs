// SVG ソース (src-tauri/icons/app-icon.svg) を 3 種の PNG に書き出す。
//   - app-icon.png      : 全体 (tauri icon の入力にもなる)
//   - app-icon-fg.png   : 図形のみ (背景透過)
//   - app-icon-bg.png   : 角丸ベースのみ
//
// 出し分けは SVG 内の <g id="bg"> / <g id="fg"> に対する
// `display:none` のスタイル注入で行う。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const iconsDir = resolve(repoRoot, "src-tauri/icons");
const svgPath = resolve(iconsDir, "app-icon.svg");

const SIZE = 1024;
const baseSvg = readFileSync(svgPath, "utf8");

const variants = [
	{ name: "app-icon.png", hide: null },
	{ name: "app-icon-fg.png", hide: "#bg" },
	{ name: "app-icon-bg.png", hide: "#fg" },
];

for (const { name, hide } of variants) {
	const svg = hide ? injectStyle(baseSvg, `${hide}{display:none}`) : baseSvg;
	const png = new Resvg(svg, {
		fitTo: { mode: "width", value: SIZE },
		background: "rgba(0,0,0,0)",
	})
		.render()
		.asPng();
	const out = resolve(iconsDir, name);
	writeFileSync(out, png);
	console.log(`rendered ${name} (${png.length} bytes)`);
}

function injectStyle(svg, css) {
	return svg.replace(/<svg([^>]*)>/, `<svg$1><style>${css}</style>`);
}
