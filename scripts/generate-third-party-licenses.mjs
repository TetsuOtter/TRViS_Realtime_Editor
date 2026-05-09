// 配布物に含まれるサードパーティ依存と、そのライセンスを収集して
// public/third-party-licenses.json に書き出す。
//
//   pnpm licenses:generate
//
// 収集対象:
//   - npm: package.json の dependencies (本番) から到達可能な node_modules パッケージ
//   - cargo: workspace から非 dev edge で到達可能なクレート
//
// それぞれのパッケージについて、LICENSE ファイルがあれば全文を、なければ
// SPDX 表現のみを持たせる。dev のみの依存は配布されないため除外する。
// 出力サイズが数 MB になるため、JS バンドルに含めず public/ に置いて
// ダイアログを開いたタイミングで fetch する。
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const outPath = resolve(repoRoot, "public/third-party-licenses.json");

/** @typedef {{ ecosystem: "npm" | "cargo", name: string, version: string, license: string | null, repository: string | null, licenseText: string | null }} Entry */

/** @returns {Entry[]} */
function collectNpm() {
	const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
	const prodDeps = Object.keys(rootPkg.dependencies ?? {});

	/** @type {Map<string, Entry>} */
	const byKey = new Map();
	const visited = new Set();

	const findPkgDir = (name, fromDir) => {
		// node_modules を上方向に辿って最初に見つかったものを採用 (npm/yarn/pnpm の hoisting 互換)。
		let dir = fromDir;
		while (true) {
			const candidate = join(dir, "node_modules", name);
			if (existsSync(join(candidate, "package.json"))) return candidate;
			const parent = dirname(dir);
			if (parent === dir) return null;
			dir = parent;
		}
	};

	const readLicenseText = (pkgDir) => {
		const entries = readdirSync(pkgDir);
		// LICENSE / LICENCE / COPYING / *.md など
		const cand = entries
			.filter((f) => /^(LICEN[SC]E|COPYING|NOTICE)(\..+)?$/i.test(f))
			.sort((a, b) => a.localeCompare(b));
		if (cand.length === 0) return null;
		try {
			const buf = readFileSync(join(pkgDir, cand[0]), "utf8");
			return buf.length > 200_000 ? buf.slice(0, 200_000) + "\n... (truncated)" : buf;
		} catch {
			return null;
		}
	};

	const normalizeLicense = (pkg) => {
		if (typeof pkg.license === "string") return pkg.license;
		if (pkg.license && typeof pkg.license === "object" && pkg.license.type)
			return String(pkg.license.type);
		if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
			return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
		}
		return null;
	};

	const normalizeRepo = (pkg) => {
		if (typeof pkg.repository === "string") return pkg.repository;
		if (pkg.repository && typeof pkg.repository === "object" && pkg.repository.url)
			return String(pkg.repository.url);
		return pkg.homepage ?? null;
	};

	const walk = (name, fromDir) => {
		const dir = findPkgDir(name, fromDir);
		if (!dir) return;
		if (visited.has(dir)) return;
		visited.add(dir);
		let pkg;
		try {
			pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		} catch {
			return;
		}
		const key = `${pkg.name}@${pkg.version}`;
		if (!byKey.has(key)) {
			byKey.set(key, {
				ecosystem: "npm",
				name: pkg.name,
				version: pkg.version,
				license: normalizeLicense(pkg),
				repository: normalizeRepo(pkg),
				licenseText: readLicenseText(dir),
			});
		}
		for (const dep of Object.keys(pkg.dependencies ?? {})) walk(dep, dir);
		for (const dep of Object.keys(pkg.optionalDependencies ?? {})) walk(dep, dir);
		for (const dep of Object.keys(pkg.peerDependencies ?? {})) {
			const optional = pkg.peerDependenciesMeta?.[dep]?.optional;
			if (!optional) walk(dep, dir);
		}
	};

	for (const dep of prodDeps) walk(dep, repoRoot);

	return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** @returns {Entry[]} */
function collectCargo() {
	const json = execFileSync("cargo", ["metadata", "--format-version", "1"], {
		cwd: repoRoot,
		maxBuffer: 256 * 1024 * 1024,
		encoding: "utf8",
	});
	const md = JSON.parse(json);
	const pkgs = new Map(md.packages.map((p) => [p.id, p]));
	const nodes = new Map(md.resolve.nodes.map((n) => [n.id, n]));
	const wsMembers = new Set(md.workspace_members);

	const seen = new Set();
	const walk = (id) => {
		if (seen.has(id)) return;
		seen.add(id);
		const node = nodes.get(id);
		if (!node) return;
		for (const dep of node.deps ?? []) {
			const kinds = (dep.dep_kinds ?? []).map((k) => k.kind ?? "normal");
			// dev のみの依存は配布されないので除外。build/normal は含める。
			if (kinds.length > 0 && kinds.every((k) => k === "dev")) continue;
			walk(dep.pkg);
		}
	};
	for (const m of wsMembers) walk(m);

	const findLicenseText = (manifestPath) => {
		const dir = dirname(manifestPath);
		try {
			const entries = readdirSync(dir);
			const cand = entries
				.filter((f) => /^(LICEN[SC]E|COPYING|NOTICE)([-.].+)?$/i.test(f))
				.sort((a, b) => a.localeCompare(b));
			if (cand.length === 0) return null;
			// 複数 (LICENSE-MIT / LICENSE-APACHE 等) ある場合は連結。
			const parts = [];
			for (const f of cand.slice(0, 3)) {
				try {
					const text = readFileSync(join(dir, f), "utf8");
					parts.push(`=== ${f} ===\n${text}`);
				} catch {
					/* ignore */
				}
			}
			const joined = parts.join("\n\n");
			return joined.length > 200_000 ? joined.slice(0, 200_000) + "\n... (truncated)" : joined;
		} catch {
			return null;
		}
	};

	/** @type {Entry[]} */
	const out = [];
	for (const id of seen) {
		if (wsMembers.has(id)) continue;
		const p = pkgs.get(id);
		if (!p) continue;
		out.push({
			ecosystem: "cargo",
			name: p.name,
			version: p.version,
			license: p.license ?? null,
			repository: p.repository ?? null,
			licenseText: p.manifest_path ? findLicenseText(p.manifest_path) : null,
		});
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

const npmEntries = collectNpm();
const cargoEntries = collectCargo();
const result = {
	generatedAt: new Date().toISOString(),
	entries: [...npmEntries, ...cargoEntries],
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(
	`wrote ${outPath} — npm: ${npmEntries.length}, cargo: ${cargoEntries.length}, total: ${result.entries.length}`,
);
