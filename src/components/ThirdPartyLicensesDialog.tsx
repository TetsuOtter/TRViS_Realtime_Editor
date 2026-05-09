import { useEffect, useMemo, useState } from "react";
import { Dialog } from "./Dialog";

interface Props {
	open: boolean;
	onClose: () => void;
}

interface LicenseEntry {
	ecosystem: "npm" | "cargo";
	name: string;
	version: string;
	license: string | null;
	repository: string | null;
	licenseText: string | null;
}

interface LicenseData {
	generatedAt: string;
	entries: LicenseEntry[];
}

type LoadState =
	| { kind: "idle" }
	| { kind: "loading" }
	| { kind: "ready"; data: LicenseData }
	| { kind: "error"; message: string };

// build 時に scripts/generate-third-party-licenses.mjs が public/ に書き出すファイル。
const LICENSES_URL = "./third-party-licenses.json";

export function ThirdPartyLicensesDialog({ open, onClose }: Props) {
	const [state, setState] = useState<LoadState>({ kind: "idle" });
	const [query, setQuery] = useState("");
	const [ecosystem, setEcosystem] = useState<"all" | "npm" | "cargo">("all");
	const [expandedKey, setExpandedKey] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		if (state.kind !== "idle") return;
		setState({ kind: "loading" });
		fetch(LICENSES_URL)
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return (await r.json()) as LicenseData;
			})
			.then((data) => setState({ kind: "ready", data }))
			.catch((e) => setState({ kind: "error", message: String(e) }));
	}, [open, state.kind]);

	const filtered = useMemo(() => {
		if (state.kind !== "ready") return [];
		const q = query.trim().toLowerCase();
		return state.data.entries.filter((e) => {
			if (ecosystem !== "all" && e.ecosystem !== ecosystem) return false;
			if (!q) return true;
			return (
				e.name.toLowerCase().includes(q) ||
				(e.license ?? "").toLowerCase().includes(q) ||
				e.version.toLowerCase().includes(q)
			);
		});
	}, [state, query, ecosystem]);

	return (
		<Dialog open={open} title="サードパーティライセンス" onClose={onClose} fullscreen>
			<div
				style={{
					padding: "12px 16px",
					borderBottom: "1px solid var(--border)",
					background: "var(--bg-panel)",
					display: "flex",
					gap: 12,
					alignItems: "center",
					flexWrap: "wrap",
				}}
			>
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="名前・ライセンス・バージョンで検索"
					style={{
						flex: "1 1 240px",
						minWidth: 200,
						padding: "6px 10px",
						fontSize: 13,
						border: "1px solid var(--border)",
						borderRadius: 6,
						background: "var(--bg)",
						color: "var(--text)",
					}}
				/>
				<div style={{ display: "flex", gap: 4 }}>
					{(["all", "npm", "cargo"] as const).map((eco) => (
						<button
							key={eco}
							type="button"
							onClick={() => setEcosystem(eco)}
							style={{
								padding: "5px 12px",
								fontSize: 12,
								border: "1px solid var(--border)",
								borderRadius: 4,
								background: ecosystem === eco ? "var(--accent)" : "var(--bg)",
								color: ecosystem === eco ? "#fff" : "var(--text)",
								cursor: "pointer",
							}}
						>
							{eco === "all" ? "全て" : eco}
						</button>
					))}
				</div>
				{state.kind === "ready" && (
					<span style={{ fontSize: 12, color: "var(--text-muted)" }}>
						{filtered.length} / {state.data.entries.length} 件
					</span>
				)}
			</div>

			<div
				style={{
					padding: "10px 16px",
					fontSize: 12,
					color: "var(--text-muted)",
					borderBottom: "1px solid var(--border)",
				}}
			>
				このアプリは以下のオープンソースソフトウェアを利用しています。各パッケージの権利は
				それぞれの著作権者に帰属します。
			</div>

			<div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
				{state.kind === "loading" && (
					<div style={{ padding: 24, color: "var(--text-muted)" }}>読み込み中...</div>
				)}
				{state.kind === "error" && (
					<div style={{ padding: 24, color: "var(--danger)" }}>
						ライセンス情報を読み込めませんでした: {state.message}
						<div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
							初回ビルド前であれば <code>pnpm licenses:generate</code> を実行してください。
						</div>
					</div>
				)}
				{state.kind === "ready" && filtered.length === 0 && (
					<div style={{ padding: 24, color: "var(--text-muted)" }}>該当する依存はありません。</div>
				)}
				{state.kind === "ready" &&
					filtered.map((e) => {
						const key = `${e.ecosystem}:${e.name}@${e.version}`;
						const expanded = expandedKey === key;
						return (
							<div
								key={key}
								style={{
									borderBottom: "1px solid var(--border)",
									padding: "10px 16px",
								}}
							>
								<button
									type="button"
									onClick={() => setExpandedKey(expanded ? null : key)}
									style={{
										width: "100%",
										textAlign: "left",
										background: "transparent",
										border: "none",
										padding: 0,
										cursor: "pointer",
										color: "var(--text)",
										display: "flex",
										alignItems: "center",
										gap: 10,
										flexWrap: "wrap",
									}}
								>
									<span
										style={{
											fontSize: 10,
											padding: "2px 6px",
											border: "1px solid var(--border)",
											borderRadius: 3,
											color: "var(--text-muted)",
											textTransform: "uppercase",
											letterSpacing: 0.5,
										}}
									>
										{e.ecosystem}
									</span>
									<span style={{ fontSize: 14, fontWeight: 600 }}>{e.name}</span>
									<span style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.version}</span>
									<span
										style={{
											fontSize: 12,
											color: "var(--text)",
											marginLeft: "auto",
											fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
										}}
									>
										{e.license ?? "(未指定)"}
									</span>
									<span style={{ color: "var(--text-muted)", fontSize: 12, width: 12 }}>
										{expanded ? "▾" : "▸"}
									</span>
								</button>
								{expanded && (
									<div style={{ marginTop: 8, paddingLeft: 4 }}>
										{e.repository && (
											<div style={{ fontSize: 12, marginBottom: 6 }}>
												<a
													href={normalizeRepoUrl(e.repository)}
													target="_blank"
													rel="noreferrer noopener"
													style={{ color: "var(--accent)" }}
												>
													{e.repository}
												</a>
											</div>
										)}
										{e.licenseText ? (
											<pre
												style={{
													margin: 0,
													padding: 12,
													background: "var(--bg-panel)",
													border: "1px solid var(--border)",
													borderRadius: 4,
													fontSize: 11,
													lineHeight: 1.5,
													whiteSpace: "pre-wrap",
													wordBreak: "break-word",
													maxHeight: 320,
													overflow: "auto",
													fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
												}}
											>
												{e.licenseText}
											</pre>
										) : (
											<div style={{ fontSize: 12, color: "var(--text-muted)" }}>
												ライセンス全文は同梱されていません。SPDX:{" "}
												<code>{e.license ?? "(未指定)"}</code>
											</div>
										)}
									</div>
								)}
							</div>
						);
					})}
			</div>
		</Dialog>
	);
}

function normalizeRepoUrl(repo: string): string {
	// "git+https://...", "git://...", "github:org/repo" などを開けるように整える。
	let r = repo.replace(/^git\+/, "");
	r = r.replace(/^git:\/\//, "https://");
	if (/^[\w-]+\/[\w.-]+$/.test(r)) return `https://github.com/${r}`;
	if (/^github:/.test(r)) return r.replace(/^github:/, "https://github.com/");
	return r.replace(/\.git$/, "");
}
