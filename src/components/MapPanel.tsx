import { useEffect, useRef, useCallback, useMemo } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEditorStore, selectActiveTrain } from "../store/editorStore";

// MapLibre GL JS is lazily imported to avoid SSR issues and happy-dom incompatibility.
let maplibre: typeof import("maplibre-gl") | null = null;
async function loadMapLibre() {
	if (maplibre) return maplibre;
	maplibre = await import("maplibre-gl");
	return maplibre;
}

export function MapPanel() {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<import("maplibre-gl").Map | null>(null);
	const markersRef = useRef<import("maplibre-gl").Marker[]>([]);

	const train = useEditorStore(selectActiveTrain);
	const selection = useEditorStore((s) => s.selection);
	const updateTimetableRow = useEditorStore((s) => s.updateTimetableRow);

	// Find the "active" row - use the last selected one (trainId context for row editing)
	// For simplicity, track via a ref from outside; we'll update the selected row's coords on map click
	const activeRowRef = useRef<string | null>(null);

	const rows = useMemo(() => train?.TimetableRows ?? [], [train]);

	const updateMarkers = useCallback(async () => {
		const ml = await loadMapLibre();
		const map = mapRef.current;
		if (!map) return;

		// Remove old markers
		markersRef.current.forEach((m) => m.remove());
		markersRef.current = [];

		// Remove old circle layers
		if (map.getLayer("radius-circles")) map.removeLayer("radius-circles");
		if (map.getSource("radius-data")) map.removeSource("radius-data");

		const geoRows = rows.filter((r) => r.Latitude_deg != null && r.Longitude_deg != null);

		geoRows.forEach((row) => {
			const el = document.createElement("div");
			el.style.cssText = `
				width: 20px; height: 20px; border-radius: 50%;
				background: ${row.MarkerColor ?? "var(--accent)"};
				border: 2px solid #fff;
				box-shadow: 0 1px 4px rgba(0,0,0,0.3);
				display: flex; align-items: center; justify-content: center;
				font-size: 9px; color: #fff; font-weight: bold; cursor: pointer;
			`;
			el.title = row.StationName;
			if (row.MarkerText) el.textContent = row.MarkerText;

			el.addEventListener("click", () => {
				activeRowRef.current = row.Id ?? null;
			});

			const marker = new ml.Marker({ element: el })
				.setLngLat([row.Longitude_deg!, row.Latitude_deg!])
				.setPopup(
					new ml.Popup({ offset: 12 }).setHTML(
						`<strong>${row.StationName}</strong><br>${row.Arrive ?? ""}～${row.Departure ?? ""}`,
					),
				)
				.addTo(map);
			markersRef.current.push(marker);
		});

		// Draw detection radius circles
		const circleFeatures = geoRows
			.filter((r) => r.OnStationDetectRadius_m != null && r.OnStationDetectRadius_m! > 0)
			.map((r) => ({
				type: "Feature" as const,
				geometry: {
					type: "Point" as const,
					coordinates: [r.Longitude_deg!, r.Latitude_deg!],
				},
				properties: { radius: r.OnStationDetectRadius_m! },
			}));

		if (circleFeatures.length > 0) {
			map.addSource("radius-data", {
				type: "geojson",
				data: { type: "FeatureCollection", features: circleFeatures },
			});
			map.addLayer({
				id: "radius-circles",
				type: "circle",
				source: "radius-data",
				paint: {
					"circle-radius": 20,
					"circle-color": "rgba(0, 113, 227, 0.2)",
					"circle-stroke-color": "#0071e3",
					"circle-stroke-width": 1,
				},
			});
		}

		// Fit bounds if we have geo rows
		if (geoRows.length > 0) {
			const lngs = geoRows.map((r) => r.Longitude_deg!);
			const lats = geoRows.map((r) => r.Latitude_deg!);
			const padding = 40;
			if (geoRows.length === 1) {
				map.flyTo({ center: [lngs[0], lats[0]], zoom: 13 });
			} else {
				map.fitBounds(
					[
						[Math.min(...lngs), Math.min(...lats)],
						[Math.max(...lngs), Math.max(...lats)],
					],
					{ padding },
				);
			}
		}
	}, [rows]);

	useEffect(() => {
		if (!containerRef.current) return;
		let destroyed = false;

		loadMapLibre().then((ml) => {
			if (destroyed || !containerRef.current) return;

			const map = new ml.Map({
				container: containerRef.current,
				style: "https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json",
				center: [135.5, 34.7],
				zoom: 5,
			});

			map.on("click", (e) => {
				if (!activeRowRef.current) return;
				const { lng, lat } = e.lngLat;
				const rowId = activeRowRef.current;
				if (selection.workGroupId && selection.workId && selection.trainId) {
					updateTimetableRow(selection.workGroupId, selection.workId, selection.trainId, rowId, {
						Longitude_deg: lng,
						Latitude_deg: lat,
					});
				}
			});

			mapRef.current = map;
			map.on("load", () => updateMarkers());
		});

		return () => {
			destroyed = true;
			mapRef.current?.remove();
			mapRef.current = null;
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!mapRef.current) return;
		if (!mapRef.current.isStyleLoaded()) return;
		updateMarkers();
	}, [updateMarkers]);

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<div
				style={{
					padding: "4px 8px",
					fontSize: 11,
					color: "var(--text-muted)",
					background: "var(--bg-panel)",
					borderBottom: "1px solid var(--border)",
				}}
			>
				{train
					? `地図: ${train.TrainNumber}${train.Destination ? ` → ${train.Destination}` : ""} (${rows.filter((r) => r.Latitude_deg != null).length}駅にジオタグあり)`
					: "地図: 列車を選択してください"}
				{activeRowRef.current && (
					<span style={{ marginLeft: 8, color: "var(--accent)" }}>
						地図クリックで選択行の座標を更新
					</span>
				)}
			</div>

			<div
				ref={containerRef}
				style={{ flex: 1 }}
				onClick={() => {
					// If no row is actively selected for coordinate editing,
					// pick the first row without coordinates on click
					if (!activeRowRef.current) {
						const firstNoGeo = rows.find((r) => !r.Latitude_deg && !r.Longitude_deg);
						if (firstNoGeo) activeRowRef.current = firstNoGeo.Id ?? null;
					}
				}}
			/>
		</div>
	);
}
