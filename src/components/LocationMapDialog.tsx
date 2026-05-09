import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEditorStore, selectActiveTrain } from "../store/editorStore";
import { Dialog } from "./Dialog";
import type { TimetableRowData } from "../types/trvis";

let maplibre: typeof import("maplibre-gl") | null = null;
async function loadMapLibre() {
	if (maplibre) return maplibre;
	maplibre = await import("maplibre-gl");
	return maplibre;
}

/**
 * (lng, lat) を中心に半径 radiusM[m] の地理的円を近似するポリゴン頂点列を返す。
 * GeoJSON Polygon 用のため最後の点で先頭に戻る (closed ring)。
 */
function geoCirclePolygon(
	lng: number,
	lat: number,
	radiusM: number,
	segments = 64,
): [number, number][] {
	const earthR = 6378137; // m
	const latRad = (lat * Math.PI) / 180;
	const dLatBase = (radiusM / earthR) * (180 / Math.PI);
	const dLngBase = (radiusM / (earthR * Math.cos(latRad))) * (180 / Math.PI);
	const ring: [number, number][] = [];
	for (let i = 0; i < segments; i++) {
		const t = (i / segments) * 2 * Math.PI;
		ring.push([lng + dLngBase * Math.cos(t), lat + dLatBase * Math.sin(t)]);
	}
	ring.push(ring[0]);
	return ring;
}

interface Props {
	open: boolean;
	onClose: () => void;
}

export function LocationMapDialog({ open, onClose }: Props) {
	const train = useEditorStore(selectActiveTrain);
	const selection = useEditorStore((s) => s.selection);
	const updateTimetableRow = useEditorStore((s) => s.updateTimetableRow);

	const rows = useMemo<TimetableRowData[]>(() => train?.TimetableRows ?? [], [train]);

	const [activeRowId, setActiveRowId] = useState<string | null>(null);

	useEffect(() => {
		if (!open) setActiveRowId(null);
	}, [open]);

	if (!open) return null;

	const trainTitle = train
		? `位置情報・地図 — ${train.TrainNumber}${train.Destination ? ` → ${train.Destination}` : ""}`
		: "位置情報・地図";

	return (
		<Dialog open={open} title={trainTitle} onClose={onClose} width={1100}>
			{!train || !selection.workGroupId || !selection.workId || !selection.trainId ? (
				<div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>
					列車を選択してから開いてください。
				</div>
			) : (
				<LocationMapBody
					workGroupId={selection.workGroupId}
					workId={selection.workId}
					trainId={selection.trainId}
					rows={rows}
					activeRowId={activeRowId}
					setActiveRowId={setActiveRowId}
					onCommitCoords={(rowId, lng, lat) =>
						updateTimetableRow(
							selection.workGroupId!,
							selection.workId!,
							selection.trainId!,
							rowId,
							{ Longitude_deg: lng, Latitude_deg: lat },
						)
					}
				/>
			)}
		</Dialog>
	);
}

interface BodyProps {
	workGroupId: string;
	workId: string;
	trainId: string;
	rows: TimetableRowData[];
	activeRowId: string | null;
	setActiveRowId: (id: string | null) => void;
	onCommitCoords: (rowId: string, lng: number, lat: number) => void;
}

function LocationMapBody({
	workGroupId,
	workId,
	trainId,
	rows,
	activeRowId,
	setActiveRowId,
	onCommitCoords,
}: BodyProps) {
	const updateTimetableRow = useEditorStore((s) => s.updateTimetableRow);

	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<import("maplibre-gl").Map | null>(null);
	const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
	const activeRowIdRef = useRef<string | null>(null);

	useEffect(() => {
		activeRowIdRef.current = activeRowId;
	}, [activeRowId]);

	const updateMarkers = useCallback(async () => {
		const ml = await loadMapLibre();
		const map = mapRef.current;
		if (!map) return;
		if (!map.isStyleLoaded()) return;

		markersRef.current.forEach((m) => m.remove());
		markersRef.current = [];

		if (map.getLayer("radius-circles-fill")) map.removeLayer("radius-circles-fill");
		if (map.getLayer("radius-circles-outline")) map.removeLayer("radius-circles-outline");
		if (map.getSource("radius-data")) map.removeSource("radius-data");

		const geoRows = rows.filter((r) => r.Latitude_deg != null && r.Longitude_deg != null);

		geoRows.forEach((row) => {
			const isActive = row.Id === activeRowIdRef.current;
			const el = document.createElement("div");
			el.style.cssText = `
				width: 22px; height: 22px; border-radius: 50%;
				background: ${row.MarkerColor ?? "var(--accent)"};
				border: 2px solid ${isActive ? "#ff5722" : "#fff"};
				box-shadow: 0 1px 4px rgba(0,0,0,0.3);
				display: flex; align-items: center; justify-content: center;
				font-size: 9px; color: #fff; font-weight: bold; cursor: pointer;
			`;
			el.title = row.StationName;
			if (row.MarkerText) el.textContent = row.MarkerText;
			el.addEventListener("click", (e) => {
				e.stopPropagation();
				setActiveRowId(row.Id ?? null);
			});

			const marker = new ml.Marker({ element: el })
				.setLngLat([row.Longitude_deg!, row.Latitude_deg!])
				.setPopup(
					new ml.Popup({ offset: 12 }).setHTML(
						`<strong>${row.StationName}</strong><br>${row.Arrive ?? ""}〜${row.Departure ?? ""}`,
					),
				)
				.addTo(map);
			markersRef.current.push(marker);
		});

		const circleFeatures = geoRows
			.filter((r) => r.OnStationDetectRadius_m != null && r.OnStationDetectRadius_m! > 0)
			.map((r) => ({
				type: "Feature" as const,
				geometry: {
					type: "Polygon" as const,
					coordinates: [
						geoCirclePolygon(r.Longitude_deg!, r.Latitude_deg!, r.OnStationDetectRadius_m!),
					],
				},
				properties: { radius: r.OnStationDetectRadius_m! },
			}));

		if (circleFeatures.length > 0) {
			map.addSource("radius-data", {
				type: "geojson",
				data: { type: "FeatureCollection", features: circleFeatures },
			});
			map.addLayer({
				id: "radius-circles-fill",
				type: "fill",
				source: "radius-data",
				paint: {
					"fill-color": "rgba(0, 113, 227, 0.2)",
				},
			});
			map.addLayer({
				id: "radius-circles-outline",
				type: "line",
				source: "radius-data",
				paint: {
					"line-color": "#0071e3",
					"line-width": 1,
				},
			});
		}
	}, [rows, setActiveRowId]);

	useEffect(() => {
		if (!containerRef.current) return;
		let destroyed = false;

		loadMapLibre().then((ml) => {
			if (destroyed || !containerRef.current) return;

			const geoRows = rows.filter((r) => r.Latitude_deg != null && r.Longitude_deg != null);
			let center: [number, number] = [135.5, 34.7];
			let zoom = 5;
			if (geoRows.length === 1) {
				center = [geoRows[0].Longitude_deg!, geoRows[0].Latitude_deg!];
				zoom = 13;
			} else if (geoRows.length > 1) {
				const lngs = geoRows.map((r) => r.Longitude_deg!);
				const lats = geoRows.map((r) => r.Latitude_deg!);
				center = [
					(Math.min(...lngs) + Math.max(...lngs)) / 2,
					(Math.min(...lats) + Math.max(...lats)) / 2,
				];
				zoom = 9;
			}

			const map = new ml.Map({
				container: containerRef.current,
				style: "https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json",
				center,
				zoom,
			});

			map.on("click", (e) => {
				const id = activeRowIdRef.current;
				if (!id) return;
				onCommitCoords(id, e.lngLat.lng, e.lngLat.lat);
			});

			map.on("load", () => {
				if (geoRows.length > 1) {
					const lngs = geoRows.map((r) => r.Longitude_deg!);
					const lats = geoRows.map((r) => r.Latitude_deg!);
					map.fitBounds(
						[
							[Math.min(...lngs), Math.min(...lats)],
							[Math.max(...lngs), Math.max(...lats)],
						],
						{ padding: 60, duration: 0 },
					);
				}
				updateMarkers();
			});

			mapRef.current = map;
		});

		return () => {
			destroyed = true;
			markersRef.current.forEach((m) => m.remove());
			markersRef.current = [];
			mapRef.current?.remove();
			mapRef.current = null;
		};
		// We intentionally only initialize once when this body mounts (i.e. when the
		// dialog opens). Marker / row updates are handled by the effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		if (map.isStyleLoaded()) updateMarkers();
		else map.once("load", () => updateMarkers());
	}, [updateMarkers, activeRowId]);

	const flyToRow = (row: TimetableRowData) => {
		const map = mapRef.current;
		if (!map) return;
		if (row.Latitude_deg == null || row.Longitude_deg == null) return;
		map.flyTo({ center: [row.Longitude_deg, row.Latitude_deg], zoom: 15 });
	};

	const geoCount = rows.filter((r) => r.Latitude_deg != null && r.Longitude_deg != null).length;

	return (
		<div style={{ display: "flex", height: "70vh", minHeight: 480 }}>
			{/* 左: 駅リスト */}
			<div
				style={{
					width: 420,
					minWidth: 360,
					borderRight: "1px solid var(--border)",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						padding: "8px 10px",
						background: "var(--bg-panel)",
						borderBottom: "1px solid var(--border)",
						fontSize: 12,
						color: "var(--text-muted)",
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<span>
						{rows.length}駅 / {geoCount}駅にジオタグ
					</span>
					{activeRowId && (
						<span style={{ color: "var(--accent)", fontWeight: 600 }}>地図クリックで座標設定</span>
					)}
				</div>

				<div style={{ flex: 1, overflowY: "auto" }}>
					{rows.length === 0 ? (
						<div style={{ padding: 16, fontSize: 13, color: "var(--text-muted)" }}>
							行がありません
						</div>
					) : (
						rows.map((row, idx) => (
							<RowItem
								key={row.Id}
								idx={idx}
								row={row}
								active={row.Id === activeRowId}
								onActivate={() => setActiveRowId(row.Id ?? null)}
								onFly={() => flyToRow(row)}
								onChange={(patch) =>
									updateTimetableRow(workGroupId, workId, trainId, row.Id!, patch)
								}
							/>
						))
					)}
				</div>
			</div>

			{/* 右: 地図 */}
			<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
				<div
					style={{
						padding: "8px 10px",
						background: "var(--bg-panel)",
						borderBottom: "1px solid var(--border)",
						fontSize: 12,
						color: "var(--text-muted)",
					}}
				>
					{activeRowId
						? "選択中の行: 地図をクリックすると座標を上書きします"
						: "左の駅リストから行を選択 / マーカーをクリックすると有効化します"}
				</div>
				<div ref={containerRef} style={{ flex: 1 }} />
			</div>
		</div>
	);
}

interface RowItemProps {
	idx: number;
	row: TimetableRowData;
	active: boolean;
	onActivate: () => void;
	onFly: () => void;
	onChange: (patch: Partial<TimetableRowData>) => void;
}

function RowItem({ idx, row, active, onActivate, onFly, onChange }: RowItemProps) {
	const hasGeo = row.Latitude_deg != null && row.Longitude_deg != null;

	const numInputStyle: React.CSSProperties = {
		width: "100%",
		padding: "2px 4px",
		border: "1px solid var(--border)",
		borderRadius: 3,
		background: "var(--bg)",
		fontSize: 11,
	};

	return (
		<div
			onClick={onActivate}
			style={{
				padding: "8px 10px",
				borderBottom: "1px solid var(--border)",
				background: active ? "rgba(0,113,227,0.10)" : "transparent",
				borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
				cursor: "pointer",
			}}
		>
			<div
				style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
					<span
						style={{
							fontSize: 11,
							color: "var(--text-muted)",
							minWidth: 18,
							textAlign: "right",
						}}
					>
						{idx + 1}
					</span>
					<span
						style={{
							fontSize: 13,
							fontWeight: 600,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{row.StationName}
					</span>
					{hasGeo ? (
						<span style={{ fontSize: 10, color: "var(--text-muted)" }}>📍</span>
					) : (
						<span style={{ fontSize: 10, color: "var(--text-muted)" }}>—</span>
					)}
				</div>
				<div style={{ display: "flex", gap: 4 }}>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onFly();
						}}
						disabled={!hasGeo}
						style={{
							border: "none",
							background: "none",
							cursor: hasGeo ? "pointer" : "default",
							padding: 2,
							color: "var(--accent)",
							fontSize: 12,
							opacity: hasGeo ? 1 : 0.3,
						}}
						title="地図で表示"
					>
						🔍
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onChange({ Latitude_deg: null, Longitude_deg: null });
						}}
						disabled={!hasGeo}
						style={{
							border: "none",
							background: "none",
							cursor: hasGeo ? "pointer" : "default",
							padding: 2,
							color: "var(--danger)",
							fontSize: 12,
							opacity: hasGeo ? 1 : 0.3,
						}}
						title="座標をクリア"
					>
						✕
					</button>
				</div>
			</div>
			<div
				style={{
					marginTop: 6,
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 6,
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<label style={{ fontSize: 10, color: "var(--text-muted)" }}>
					緯度
					<input
						type="number"
						step="0.000001"
						value={row.Latitude_deg ?? ""}
						onChange={(e) =>
							onChange({ Latitude_deg: e.target.value === "" ? null : Number(e.target.value) })
						}
						style={numInputStyle}
						placeholder="未設定"
					/>
				</label>
				<label style={{ fontSize: 10, color: "var(--text-muted)" }}>
					経度
					<input
						type="number"
						step="0.000001"
						value={row.Longitude_deg ?? ""}
						onChange={(e) =>
							onChange({ Longitude_deg: e.target.value === "" ? null : Number(e.target.value) })
						}
						style={numInputStyle}
						placeholder="未設定"
					/>
				</label>
				<label style={{ fontSize: 10, color: "var(--text-muted)" }}>
					起点距離(m)
					<input
						type="number"
						step="1"
						value={row.Location_m ?? ""}
						onChange={(e) =>
							onChange({
								// Location_m はスキーマ上 required(number)。空欄時は 0 として扱う。
								Location_m: e.target.value === "" ? 0 : Number(e.target.value),
							})
						}
						style={numInputStyle}
						placeholder="0"
					/>
				</label>
				<label style={{ fontSize: 10, color: "var(--text-muted)" }}>
					検出半径(m)
					<input
						type="number"
						step="1"
						min={0}
						value={row.OnStationDetectRadius_m ?? ""}
						onChange={(e) =>
							onChange({
								OnStationDetectRadius_m: e.target.value === "" ? null : Number(e.target.value),
							})
						}
						style={numInputStyle}
						placeholder="未設定"
					/>
				</label>
			</div>
		</div>
	);
}
