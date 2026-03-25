import React, { useEffect } from "react";
import { Text } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

import { useDailyReportScreen } from "@/hooks/useDailyReportScreen";

const mockGetDailyReportV2 = jest.fn();
const mockUseDailyReportsV2 = jest.fn();

jest.mock("@/lib/api", () => ({
  getDailyReportV2: (...args: unknown[]) => mockGetDailyReportV2(...args),
}));

jest.mock("@/hooks/useReports", () => ({
  useDailyReportsV2: (...args: unknown[]) => mockUseDailyReportsV2(...args),
}));

function Harness({
  selectedDate,
  expanded,
  onSnapshot,
}: {
  selectedDate?: string | null;
  expanded: string[];
  onSnapshot: (snapshot: {
    statusByDate: Record<string, string>;
    dayByDate: Record<string, unknown>;
  }) => void;
}) {
  const { setV2Expanded, v2DayByDate, v2DayStatusByDate } = useDailyReportScreen(30, selectedDate);

  useEffect(() => {
    setV2Expanded(expanded);
  }, [expanded, setV2Expanded]);

  useEffect(() => {
    onSnapshot({
      statusByDate: v2DayStatusByDate,
      dayByDate: v2DayByDate,
    });
  }, [onSnapshot, v2DayByDate, v2DayStatusByDate]);

  return <Text testID="status">{selectedDate ? v2DayStatusByDate[selectedDate] ?? "idle" : "idle"}</Text>;
}

describe("useDailyReportScreen ownership", () => {
  beforeEach(() => {
    mockGetDailyReportV2.mockReset();
    mockUseDailyReportsV2.mockReset();
    const reportListResult = {
      data: [{ date: "2025-01-01" }],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      dataUpdatedAt: 1,
    };
    mockUseDailyReportsV2.mockReturnValue({
      ...reportListResult,
    });
  });

  it("fetches a selected report day through the hook and reaches success state", async () => {
    mockGetDailyReportV2.mockResolvedValue({ date: "2025-01-01", events: [] });
    const snapshots: Array<{ statusByDate: Record<string, string>; dayByDate: Record<string, unknown> }> = [];

    const onSnapshot = (snapshot: { statusByDate: Record<string, string>; dayByDate: Record<string, unknown> }) => {
      snapshots.push(snapshot);
    };

    const { getByTestId } = render(
      <Harness selectedDate="2025-01-01" expanded={["2025-01-01"]} onSnapshot={onSnapshot} />
    );

    await waitFor(() => {
      expect(getByTestId("status").props.children).toBe("success");
    });

    expect(mockGetDailyReportV2).toHaveBeenCalledWith("2025-01-01");
    expect(snapshots.some((snapshot) => snapshot.statusByDate["2025-01-01"] === "loading")).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.statusByDate["2025-01-01"] === "success")).toBe(true);
  });

  it("tracks error separately from loading when a day fetch fails", async () => {
    mockGetDailyReportV2.mockRejectedValue(new Error("boom"));
    const snapshots: Array<{ statusByDate: Record<string, string>; dayByDate: Record<string, unknown> }> = [];

    const onSnapshot = (snapshot: { statusByDate: Record<string, string>; dayByDate: Record<string, unknown> }) => {
      snapshots.push(snapshot);
    };

    const { getByTestId } = render(
      <Harness selectedDate="2025-01-02" expanded={[]} onSnapshot={onSnapshot} />
    );

    await waitFor(() => {
      expect(getByTestId("status").props.children).toBe("error");
    });

    expect(mockGetDailyReportV2).toHaveBeenCalledWith("2025-01-02");
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.statusByDate["2025-01-02"] === "error" && snapshot.dayByDate["2025-01-02"] === undefined
      )
    ).toBe(true);
  });
});
