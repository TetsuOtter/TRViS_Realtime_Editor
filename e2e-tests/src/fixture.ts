import type {
	WorkGroupData,
	WorkData,
	TrainData,
	TimetableRowData,
} from "../../src/types/trvis.js";

/**
 * Creates a WorkGroupData[] fixture where every property is set to a unique
 * sentinel value so that the "all properties reflected" test can verify each
 * field is correctly transmitted through the WS server to the harness.
 */
export function buildSentinelFixture(): WorkGroupData[] {
	const row1: TimetableRowData = {
		Id: "row-id-1",
		StationName: "station-sentinel-1",
		Location_m: 1001.5,
		Longitude_deg: 135.5,
		Latitude_deg: 34.5,
		OnStationDetectRadius_m: 50.5,
		FullName: "full-name-sentinel-1",
		RecordType: 11,
		TrackName: "track-sentinel-1",
		DriveTime_MM: 3,
		DriveTime_SS: 45,
		IsOperationOnlyStop: true,
		IsPass: false,
		HasBracket: true,
		IsLastStop: false,
		Arrive: "10:00",
		Departure: "10:05",
		RunInLimit: 80,
		RunOutLimit: 90,
		Remarks: "row-remarks-sentinel-1",
		MarkerColor: "#ff0000",
		MarkerText: "marker-sentinel-1",
		WorkType: 2,
	};

	const row2: TimetableRowData = {
		Id: "row-id-2",
		StationName: "station-sentinel-2",
		Location_m: 2002.5,
		Longitude_deg: 136.5,
		Latitude_deg: 35.5,
		OnStationDetectRadius_m: 60.5,
		FullName: "full-name-sentinel-2",
		RecordType: 22,
		TrackName: "track-sentinel-2",
		DriveTime_MM: 4,
		DriveTime_SS: 55,
		IsOperationOnlyStop: false,
		IsPass: true,
		HasBracket: false,
		IsLastStop: true,
		Arrive: "11:00",
		Departure: "11:10",
		RunInLimit: 70,
		RunOutLimit: 85,
		Remarks: "row-remarks-sentinel-2",
		MarkerColor: "#00ff00",
		MarkerText: "marker-sentinel-2",
		WorkType: 3,
	};

	const train1: TrainData = {
		Id: "train-id-1",
		TrainNumber: "train-number-sentinel-1",
		MaxSpeed: "130",
		SpeedType: "speed-type-sentinel-1",
		NominalTractiveCapacity: "nominal-sentinel-1",
		CarCount: 8,
		Destination: "destination-sentinel-1",
		BeginRemarks: "begin-remarks-sentinel-1",
		AfterRemarks: "after-remarks-sentinel-1",
		Remarks: "train-remarks-sentinel-1",
		BeforeDeparture: "before-departure-sentinel-1",
		TrainInfo: "train-info-sentinel-1",
		Direction: 1,
		WorkType: 4,
		AfterArrive: "after-arrive-sentinel-1",
		BeforeDeparture_OnStationTrackCol: "bd-track-sentinel-1",
		AfterArrive_OnStationTrackCol: "aa-track-sentinel-1",
		DayCount: 1,
		IsRideOnMoving: true,
		Color: "#0000ff",
		TimetableRows: [row1, row2],
		NextTrainId: "next-train-id-sentinel-1",
	};

	const work1: WorkData = {
		Id: "work-id-1",
		Name: "work-name-sentinel-1",
		AffectDate: "2024-01-01",
		AffixContentType: 5,
		AffixContent: "affix-content-sentinel-1",
		Remarks: "work-remarks-sentinel-1",
		HasETrainTimetable: true,
		ETrainTimetableContentType: 6,
		ETrainTimetableContent: "etrain-content-sentinel-1",
		Trains: [train1],
	};

	const wg1: WorkGroupData = {
		Id: "wg-id-1",
		Name: "wg-name-sentinel-1",
		DBVersion: 42,
		Works: [work1],
	};

	return [wg1];
}

/** Builds a second fixture with different work group for add/remove tests. */
export function buildSecondWorkGroup(): WorkGroupData {
	return {
		Id: "wg-id-2",
		Name: "wg-name-2",
		DBVersion: 1,
		Works: [
			{
				Id: "work-id-2",
				Name: "work-name-2",
				AffectDate: null,
				AffixContentType: null,
				AffixContent: null,
				Remarks: null,
				HasETrainTimetable: null,
				ETrainTimetableContentType: null,
				ETrainTimetableContent: null,
				Trains: [
					{
						Id: "train-id-2",
						TrainNumber: "T2",
						MaxSpeed: null,
						SpeedType: null,
						NominalTractiveCapacity: null,
						CarCount: null,
						Destination: null,
						BeginRemarks: null,
						AfterRemarks: null,
						Remarks: null,
						BeforeDeparture: null,
						TrainInfo: null,
						Direction: 0,
						WorkType: null,
						AfterArrive: null,
						BeforeDeparture_OnStationTrackCol: null,
						AfterArrive_OnStationTrackCol: null,
						DayCount: null,
						IsRideOnMoving: null,
						Color: null,
						TimetableRows: [
							{
								Id: "row-id-3",
								StationName: "station-3",
								Location_m: 3000,
								Longitude_deg: null,
								Latitude_deg: null,
								OnStationDetectRadius_m: null,
								FullName: null,
								RecordType: null,
								TrackName: null,
								DriveTime_MM: null,
								DriveTime_SS: null,
								IsOperationOnlyStop: null,
								IsPass: null,
								HasBracket: null,
								IsLastStop: null,
								Arrive: null,
								Departure: null,
								RunInLimit: null,
								RunOutLimit: null,
								Remarks: null,
								MarkerColor: null,
								MarkerText: null,
								WorkType: null,
							},
						],
						NextTrainId: null,
					},
				],
			},
		],
	};
}
