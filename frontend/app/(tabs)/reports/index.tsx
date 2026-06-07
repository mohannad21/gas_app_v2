import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FontFamilies, FontSizes } from "@/constants/typography";
import { Spacing } from "@/constants/spacing";
import ReportHeader from "@/components/reports/ReportHeader";
import CustomerBalancesSection from "@/components/reports/CustomerBalancesSection";
import CompanyBalancesSection from "@/components/reports/CompanyBalancesSection";
import FilterChipRow from "@/components/add/FilterChipRow";
import { useCreateExpense } from "@/hooks/useExpenses";
import { useDailyReportScreen } from "@/hooks/useDailyReportScreen";
import { useBalancesSummary } from "@/hooks/useBalancesSummary";
import { useExpenseModal } from "@/hooks/useExpenseModal";
import { useDaySelection } from "@/hooks/useDaySelection";
import { useRevealShelf } from "@/hooks/useRevealShelf";
import { formatEventType } from "@/lib/reports/utils";
import { ACTIVITY_KIND_META, FILTER_GROUP_LABELS, isActivityKindVisibleOnSurface, normalizeEventType } from "@/lib/activityKindMeta";
import EventExpandedPanel from "@/components/reports/EventExpandedPanel";
import { buildHappenedAt, toDateKey } from "@/lib/date";
import { formatDisplayMoney, getCurrencySymbol } from "@/lib/money";
import SlimActivityRow from "@/components/reports/SlimActivityRow";
import DayPickerStrip from "@/components/reports/DayPickerStrip";
import {
  SCREEN_STATE_WORDING,
  EXPENSE_MODAL_WORDING,
} from "@/lib/wording";

type RevealShelfKey = "ledger" | "customers" | "company";
type ActivityFilterGroupKey = "customer" | "company" | "expenses" | "ledger";
type ActivityFilterOption = { key: ActivityFilterGroupKey; label: string };
type ActivitySubtypeOption = { key: string; label: string };


const formatMoney = (value: number) => formatDisplayMoney(value);
const formatCount = (value: number) => Number(value || 0).toFixed(0);

const ISO_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

const getPreciseReportTimestampMicros = (value?: string | null) => {
  if (!value) return 0;
  const raw = String(value).trim();
  const match = ISO_TS_RE.exec(raw);
  if (match) {
    const [, base, fraction = "", suffix] = match;
    const microsText = `${fraction}000000`.slice(0, 6);
    const millisecondsText = microsText.slice(0, 3);
    const parsedMs = Date.parse(
      millisecondsText === "000"
        ? `${base}${suffix}`
        : `${base}.${millisecondsText}${suffix}`
    );
    if (!Number.isNaN(parsedMs)) {
      const micros = Number(microsText);
      const parsedMillisPortion = Number(millisecondsText) * 1000;
      return parsedMs * 1000 + (micros - parsedMillisPortion);
    }
  }
  const fallback = Date.parse(raw);
  return Number.isNaN(fallback) ? 0 : fallback * 1000;
};

const getReportEffectiveTime = (event: any) =>
  getPreciseReportTimestampMicros(event?.effective_at ?? null);

const getReportCreatedTime = (event: any) =>
  getPreciseReportTimestampMicros(event?.created_at ?? null);

const sortReportEventsNewestFirst = (events: any[]) =>
  [...events].sort((left, right) => {
    const rightEffectiveTime = getReportEffectiveTime(right);
    const leftEffectiveTime = getReportEffectiveTime(left);
    if (rightEffectiveTime !== leftEffectiveTime) return rightEffectiveTime - leftEffectiveTime;

    const rightCreatedTime = getReportCreatedTime(right);
    const leftCreatedTime = getReportCreatedTime(left);
    if (rightCreatedTime !== leftCreatedTime) return rightCreatedTime - leftCreatedTime;

    return String(right?.id ?? right?.source_id ?? "").localeCompare(String(left?.id ?? left?.source_id ?? ""));
  });

const ACTIVITY_GROUP_OPTIONS: Record<Exclude<ActivityFilterGroupKey, "all">, ActivityFilterOption> = {
  customer: { key: "customer", label: FILTER_GROUP_LABELS.customer },
  company: { key: "company", label: FILTER_GROUP_LABELS.company },
  expenses: { key: "expenses", label: FILTER_GROUP_LABELS.expenses },
  ledger: { key: "ledger", label: FILTER_GROUP_LABELS.ledger },
};
const ACTIVITY_GROUP_ORDER: ActivityFilterGroupKey[] = ["customer", "company", "expenses", "ledger"];

const getEventGroupKey = (event: any): Exclude<ActivityFilterGroupKey, "all"> => {
  const kind = normalizeEventType(String(event?.event_type ?? ""), {
    order_mode: event?.order_mode,
    money_direction: event?.money_direction,
  });
  if (kind) return ACTIVITY_KIND_META[kind].filterGroup as Exclude<ActivityFilterGroupKey, "all">;
  return "customer";
};

const getEventSubtype = (event: any): ActivitySubtypeOption => {
  const kind = normalizeEventType(String(event?.event_type ?? ""), {
    order_mode: event?.order_mode,
    money_direction: event?.money_direction,
  });
  if (kind) return { key: kind, label: ACTIVITY_KIND_META[kind].label };
  const raw = String(event?.event_type ?? "activity");
  return { key: raw, label: formatEventType(raw) };
};

export default function ReportsScreen() {
  // Expense modal state
  // Extract expense modal state into custom hook
  const {
    expenseModalOpen,
    setExpenseModalOpen,
    expenseDate,
    setExpenseDate,
    expenseType,
    setExpenseType,
    customExpenseType,
    setCustomExpenseType,
    expenseAmount,
    setExpenseAmount,
    expenseNote,
    setExpenseNote,
    useCustomType,
    setUseCustomType,
    allowExpenseInput,
    setAllowExpenseInput,
    resetExpenseForm,
  } = useExpenseModal();

  // Sync tooltip
  const [syncInfoDate, setSyncInfoDate] = useState<string | null>(null);
  const [activityGroupFilter, setActivityGroupFilter] = useState<ActivityFilterGroupKey | null>(null);
  const [activitySubtypeFilter, setActivitySubtypeFilter] = useState<string | null>(null);
  const [activityLevel3Filter, setActivityLevel3Filter] = useState<string | null>(null);

  // Extract day selection state into custom hook
  const { selectedDate, setSelectedDate, openEventKeys, setOpenEventKeys } = useDaySelection();

  // Route handling
  const params = useLocalSearchParams<{
    mode?: string;
    addExpense?: string;
    expand?: string;
    date?: string;
    highlightId?: string;
    highlightEventType?: string;
    highlightEffectiveAt?: string;
  }>();
  const [handledRouteKey, setHandledRouteKey] = useState<string | null>(null);
  const [highlightEventKey, setHighlightEventKey] = useState<string | null>(null);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const lastHighlightParamKey = useRef<string | null>(null);

  // Hooks
  const createExpense = useCreateExpense();
  const {
    v2Query,
    v2Rows,
    v2Expanded,
    setV2Expanded,
    v2DayByDate,
    v2DayStatusByDate,
    refetchV2,
  } = useDailyReportScreen(30, selectedDate);
  const { balanceSummary, companySummary, companyBalancesQuery } = useBalancesSummary();

  // Extract reveal shelf state and animations into custom hook
  const {
    revealVisible,
    setRevealVisible,
    actionsVisible,
    setActionsVisible,
    activeShelf,
    setActiveShelf,
    revealHeight,
    setRevealHeight,
    revealAnim,
    actionsAnim,
    spacerAnim,
    shelfAnim,
    revealTimerRef,
    scrollTracker,
    animateShelfIn,
  } = useRevealShelf();

  const expenseTypes = ["fuel", "food", "car test", "car repair", "car insurance", "others"];
  const accessoryId = Platform.OS === "ios" ? "expenseAccessory" : undefined;

  const openExpenseModal = useCallback(
    (date: string, preset?: { type: string; amount: number; note?: string | null }) => {
      setExpenseDate(date);
      if (preset) {
        const match = expenseTypes.includes(preset.type) ? preset.type : "";
        if (match) {
          setExpenseType(match);
          setUseCustomType(false);
          setCustomExpenseType("");
        } else {
          setUseCustomType(true);
          setCustomExpenseType(preset.type);
        }
        setExpenseAmount(String(preset.amount));
        setExpenseNote(preset.note ?? "");
      } else {
        setExpenseType("fuel");
        setCustomExpenseType("");
        setUseCustomType(false);
        setExpenseAmount("");
        setExpenseNote("");
      }
      setExpenseModalOpen(true);
    },
    [expenseTypes]
  );

  const saveExpense = useCallback(async () => {
    const date = expenseDate;
    const type = useCustomType ? customExpenseType.trim() : expenseType.trim();
    const amount = Number(expenseAmount);

    if (!date) return;

    if (!type) {
      Alert.alert("Missing type", "Please select or enter an expense type.");
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }

    await createExpense.mutateAsync({
      date,
      expense_type: type,
      amount,
      note: expenseNote.trim() ? expenseNote.trim() : undefined,
      happened_at: buildHappenedAt({ date }),
    });

    setExpenseModalOpen(false);
    setAllowExpenseInput(false);
  }, [expenseAmount, expenseDate, expenseNote, expenseType, useCustomType, customExpenseType, createExpense]);

  // Route params (FIXED: setExpanded expects string[])
  useEffect(() => {
    const addExpense = Array.isArray(params.addExpense) ? params.addExpense[0] : params.addExpense;
    const expand = Array.isArray(params.expand) ? params.expand[0] : params.expand;
    const dateParam = Array.isArray(params.date) ? params.date[0] : params.date;
    const highlightId = Array.isArray(params.highlightId) ? params.highlightId[0] : params.highlightId;
    const highlightEventType = Array.isArray(params.highlightEventType) ? params.highlightEventType[0] : params.highlightEventType;
    const highlightEffectiveAt = Array.isArray(params.highlightEffectiveAt) ? params.highlightEffectiveAt[0] : params.highlightEffectiveAt;

    const todayStr = toDateKey(new Date());
    const date = dateParam || todayStr;
    const routeKey = [addExpense ?? "", expand ?? "", date, highlightId ?? "", highlightEventType ?? "", highlightEffectiveAt ?? ""].join("|");
    if (routeKey === handledRouteKey) return;

    setSelectedDate(date);
    setV2Expanded([date]);

    if (addExpense === "1") {
      setAllowExpenseInput(true);
      openExpenseModal(date);
      setHandledRouteKey(routeKey);
      return;
    }

    setHandledRouteKey(routeKey);
  }, [handledRouteKey, openExpenseModal, params, setSelectedDate, setV2Expanded]);

  useFocusEffect(
    useCallback(() => {
      refetchV2();
      return () => {
        setHighlightEventKey(null);
        setHighlightDate(null);
        lastHighlightParamKey.current = null;
      };
    }, [refetchV2])
  );

  useEffect(() => {
    if (!v2Rows.length) return;
    if (selectedDate && v2Rows.some((row) => row.date === selectedDate)) return;
    setSelectedDate(v2Rows[0]?.date ?? null);
  }, [selectedDate, v2Rows]);

  const toggleDay = useCallback((date: string) => {
    setV2Expanded((prev) => (prev.includes(date) ? prev.filter((value) => value !== date) : [...prev, date]));
  }, [setV2Expanded]);

  const showRevealLayer = useCallback(() => {
    setRevealVisible(true);
  }, [setRevealVisible]);

  const hideRevealLayer = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setRevealVisible(false);
    setActionsVisible(false);
    setActiveShelf(null);
  }, []);

  const resetScrollIntent = useCallback(() => {
    scrollTracker.current.direction = null;
    scrollTracker.current.travel = 0;
    scrollTracker.current.lastTime = 0;
  }, []);

  const latestCard = v2Rows[0];
  const selectedCard = selectedDate ? v2Rows.find((row) => row.date === selectedDate) ?? null : null;
  const displayCard = selectedCard ?? latestCard;
  const latestInventory = displayCard?.inventory_end;
  const selectedDayInfo = selectedDate ? v2DayByDate[selectedDate] ?? null : null;
  const selectedDayStatus = selectedDate ? v2DayStatusByDate[selectedDate] ?? "idle" : "idle";
  const rawSelectedEvents = sortReportEventsNewestFirst(
    ((selectedDayInfo?.events ?? []) as any[]).filter((ev) => {
      const kind = normalizeEventType(String(ev?.event_type ?? ""), {
        order_mode: ev?.order_mode,
        money_direction: ev?.money_direction,
      });
      return kind ? isActivityKindVisibleOnSurface(kind, "dailyReport") : true;
    })
  );
  const availableGroupOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: ActivityFilterOption[] = [];
    for (const event of rawSelectedEvents) {
      const groupKey = getEventGroupKey(event);
      if (seen.has(groupKey)) continue;
      seen.add(groupKey);
      options.push(ACTIVITY_GROUP_OPTIONS[groupKey]);
    }
    return options.sort((left, right) => ACTIVITY_GROUP_ORDER.indexOf(left.key) - ACTIVITY_GROUP_ORDER.indexOf(right.key));
  }, [rawSelectedEvents]);
  const availableSubtypeOptions = useMemo(() => {
    if (!activityGroupFilter) return [] as ActivitySubtypeOption[];
    const seen = new Set<string>();
    const options: ActivitySubtypeOption[] = [];
    for (const event of rawSelectedEvents) {
      if (getEventGroupKey(event) !== activityGroupFilter) continue;
      const subtype = getEventSubtype(event);
      if (seen.has(subtype.key)) continue;
      seen.add(subtype.key);
      options.push(subtype);
    }
    return options;
  }, [activityGroupFilter, rawSelectedEvents]);
  const l2FilteredEvents = useMemo(() => {
    return rawSelectedEvents.filter((event) => {
      if (activityGroupFilter && getEventGroupKey(event) !== activityGroupFilter) return false;
      if (activityGroupFilter && activitySubtypeFilter && getEventSubtype(event).key !== activitySubtypeFilter) return false;
      return true;
    });
  }, [activityGroupFilter, activitySubtypeFilter, rawSelectedEvents]);
  const availableLevel3Options = useMemo(() => {
    if (activitySubtypeFilter !== "replacement") return [] as { key: string; label: string }[];
    const check = (key: string, label: string, predicate: (ev: any) => boolean) =>
      l2FilteredEvents.some(predicate) ? { key, label } : null;
    return [
      check("money_debt", "Money debt", (ev) => (ev.order_total ?? 0) - (ev.order_paid ?? 0) > 0),
      check("money_credit", "Money credit", (ev) => (ev.order_total ?? 0) - (ev.order_paid ?? 0) < 0),
      check("12kg_debt", "12kg debt", (ev) => ev.gas_type === "12kg" && (ev.order_installed ?? 0) > (ev.order_received ?? 0)),
      check("12kg_credit", "12kg credit", (ev) => ev.gas_type === "12kg" && (ev.order_installed ?? 0) < (ev.order_received ?? 0)),
      check("48kg_debt", "48kg debt", (ev) => ev.gas_type === "48kg" && (ev.order_installed ?? 0) > (ev.order_received ?? 0)),
      check("48kg_credit", "48kg credit", (ev) => ev.gas_type === "48kg" && (ev.order_installed ?? 0) < (ev.order_received ?? 0)),
    ].filter((opt): opt is { key: string; label: string } => opt !== null);
  }, [activitySubtypeFilter, l2FilteredEvents]);
  const selectedEvents = useMemo(() => {
    return rawSelectedEvents.filter((event) => {
      if (activityGroupFilter && getEventGroupKey(event) !== activityGroupFilter) return false;
      if (activityGroupFilter && activitySubtypeFilter) {
        if (getEventSubtype(event).key !== activitySubtypeFilter) return false;
      }
      if (activitySubtypeFilter === "replacement" && activityLevel3Filter) {
        const moneyDiff = (event?.order_total ?? 0) - (event?.order_paid ?? 0);
        const cylDiff = (event?.order_installed ?? 0) - (event?.order_received ?? 0);
        switch (activityLevel3Filter) {
          case "money_debt": return moneyDiff > 0;
          case "money_credit": return moneyDiff < 0;
          case "12kg_debt": return event?.gas_type === "12kg" && cylDiff > 0;
          case "12kg_credit": return event?.gas_type === "12kg" && cylDiff < 0;
          case "48kg_debt": return event?.gas_type === "48kg" && cylDiff > 0;
          case "48kg_credit": return event?.gas_type === "48kg" && cylDiff < 0;
          default: return true;
        }
      }
      return true;
    });
  }, [activityGroupFilter, activitySubtypeFilter, activityLevel3Filter, rawSelectedEvents]);
  const keepTabsVisible = selectedEvents.length < 5;

  useEffect(() => {
    const highlightId = Array.isArray(params.highlightId) ? params.highlightId[0] : params.highlightId;
    const highlightEventType = Array.isArray(params.highlightEventType) ? params.highlightEventType[0] : params.highlightEventType;
    const highlightEffectiveAt = Array.isArray(params.highlightEffectiveAt) ? params.highlightEffectiveAt[0] : params.highlightEffectiveAt;
    if (!highlightId && !highlightEventType && !highlightEffectiveAt) {
      return;
    }
    const paramKey = [highlightId, highlightEventType, highlightEffectiveAt].filter(Boolean).join("|");
    if (lastHighlightParamKey.current === paramKey) return;
    const match = rawSelectedEvents.find((event) => {
      if (highlightId) {
        return (
          String(event?.id ?? "") === highlightId ||
          String(event?.source_id ?? "") === highlightId
        );
      }
      if (highlightEventType && String(event?.event_type ?? "") !== highlightEventType) {
        return false;
      }
      if (highlightEffectiveAt && String(event?.effective_at ?? "").slice(0, 10) !== highlightEffectiveAt.slice(0, 10)) {
        return false;
      }
      return Boolean(highlightEventType || highlightEffectiveAt);
    });
    if (!match) return;
    lastHighlightParamKey.current = paramKey;
    const eventKey = String(match?.id ?? match?.source_id ?? `${match?.event_type ?? "ev"}:${match?.effective_at ?? ""}`);
    const eventDate = (match?.effective_at ?? "").slice(0, 10) || null;
    setHighlightEventKey(eventKey);
    setHighlightDate(eventDate);
    router.setParams({ highlightId: undefined, highlightEventType: undefined, highlightEffectiveAt: undefined });
    const timer = setTimeout(() => {
      setHighlightEventKey((current) => (current === eventKey ? null : current));
      setHighlightDate((current) => (current === eventDate ? null : current));
      lastHighlightParamKey.current = null;
    }, 7200);
    return () => clearTimeout(timer);
  }, [params.highlightEffectiveAt, params.highlightEventType, params.highlightId, rawSelectedEvents]);

  useEffect(() => {
    setActivityGroupFilter(null);
    setActivitySubtypeFilter(null);
    setActivityLevel3Filter(null);
  }, [selectedDate]);

  useEffect(() => {
    if (activityGroupFilter && !availableGroupOptions.some((option) => option.key === activityGroupFilter)) {
      setActivityGroupFilter(null);
    }
  }, [activityGroupFilter, availableGroupOptions]);

  useEffect(() => {
    if (!activityGroupFilter) {
      if (activitySubtypeFilter) setActivitySubtypeFilter(null);
      return;
    }
    if (activitySubtypeFilter && !availableSubtypeOptions.some((option) => option.key === activitySubtypeFilter)) {
      setActivitySubtypeFilter(null);
    }
  }, [activitySubtypeFilter, availableSubtypeOptions, activityGroupFilter]);

  useEffect(() => {
    setActivityLevel3Filter(null);
  }, [activitySubtypeFilter]);

  const handleShelfPress = useCallback(
    (nextShelf: RevealShelfKey) => {
      if (activeShelf === nextShelf) {
        setActiveShelf(null);
        return;
      }
      setActiveShelf(nextShelf);
      animateShelfIn();
    },
    [activeShelf, animateShelfIn]
  );

  const handleRevealScroll = useCallback(
    (offsetY: number) => {
      if (keepTabsVisible) {
        return;
      }
      const now = Date.now();
      const clampedY = Math.max(offsetY, 0);
      const previousY = scrollTracker.current.lastY;
      const delta = clampedY - previousY;
      scrollTracker.current.lastY = clampedY;
      const elapsed = scrollTracker.current.lastTime ? now - scrollTracker.current.lastTime : 16;
      scrollTracker.current.lastTime = now;

      if (elapsed > 220) {
        scrollTracker.current.direction = null;
        scrollTracker.current.travel = 0;
      }

      if (Math.abs(delta) < 3) return;

      const direction: "up" | "down" = delta < 0 ? "up" : "down";
      const speed = Math.abs(delta) / Math.max(elapsed, 16);

      if (speed < 0.45) {
        scrollTracker.current.direction = direction;
        scrollTracker.current.travel = 0;
        return;
      }

      if (scrollTracker.current.direction !== direction) {
        scrollTracker.current.direction = direction;
        scrollTracker.current.travel = Math.abs(delta);
      } else {
        scrollTracker.current.travel += Math.abs(delta);
      }

      if (direction === "up" && scrollTracker.current.travel >= 48) {
        showRevealLayer();
        scrollTracker.current.travel = 0;
      } else if (direction === "down" && scrollTracker.current.travel >= 64) {
        hideRevealLayer();
        scrollTracker.current.travel = 0;
      }
    },
    [hideRevealLayer, keepTabsVisible, showRevealLayer]
  );

  const handleScrollEnd = useCallback(() => {
    resetScrollIntent();
  }, [resetScrollIntent]);

  const toggleEventKey = useCallback((key: string) => {
    setOpenEventKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }, [setOpenEventKeys]);

  useEffect(() => {
    if (!selectedDate) return;
    if (keepTabsVisible) {
      setRevealVisible(true);
      return;
    }
    setRevealVisible(false);
    setActionsVisible(false);
    setActiveShelf(null);
  }, [keepTabsVisible, selectedDate, setActionsVisible, setActiveShelf, setRevealVisible]);

  const revealShelfContent =
    activeShelf === "ledger" ? (
      <Animated.View
        key="ledger"
        style={[
          styles.revealShelfBody,
          {
            opacity: shelfAnim,
            transform: [
              {
                translateY: shelfAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.reusedShelfWrap}>
          <ReportHeader
            inventory={{
              full12: formatCount(latestInventory?.full12 ?? 0),
              empty12: formatCount(latestInventory?.empty12 ?? 0),
              full48: formatCount(latestInventory?.full48 ?? 0),
              empty48: formatCount(latestInventory?.empty48 ?? 0),
            }}
            walletEnd={formatMoney(displayCard?.wallet_end ?? 0)}
            onAdjustInventory={() => {
              router.push("/(tabs)/add?open=adjust-inventory");
            }}
            onAdjustCash={() => {
              router.push("/(tabs)/add?open=adjust-cash");
            }}
          />
        </View>
      </Animated.View>
    ) : activeShelf === "customers" ? (
      <Animated.View
        key="customers"
        style={[
          styles.revealShelfBody,
          {
            opacity: shelfAnim,
            transform: [
              {
                translateY: shelfAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          },
        ]}
      >
        <CustomerBalancesSection
          balanceSummary={balanceSummary}
          formatMoney={formatMoney}
          formatCustomerCount={(count) => `${count} cust`}
          containerStyle={styles.reusedSection}
          initiallyExpanded
        />
      </Animated.View>
    ) : activeShelf === "company" ? (
      <Animated.View
        key="company"
        style={[
          styles.revealShelfBody,
          {
            opacity: shelfAnim,
            transform: [
              {
                translateY: shelfAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          },
        ]}
      >
        <CompanyBalancesSection
          companySummary={companySummary}
          companyBalancesReady={Boolean(companyBalancesQuery.data)}
          formatMoney={formatMoney}
          formatCount={formatCount}
          containerStyle={styles.reusedSection}
          initiallyExpanded
        />
      </Animated.View>
    ) : null;

  // -------------------------
  // VIEW MODE: NEW (V2)
  // -------------------------
  return (
    <View style={styles.container}>
      <Animated.View
        testID="reports-reveal-layer"
        pointerEvents={revealVisible ? "auto" : "none"}
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          if (nextHeight !== revealHeight) {
            setRevealHeight(nextHeight);
          }
        }}
        style={[
          styles.revealLayer,
          {
            opacity: revealAnim,
            transform: [
              {
                translateY: revealAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-18, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.segmentBar}>
          {(["ledger", "customers", "company"] as RevealShelfKey[]).map((segment) => {
            const isActive = activeShelf === segment;
            const label = segment === "ledger" ? "Ledger" : segment === "customers" ? "Customers" : "Company";
            return (
              <Pressable
                key={segment}
                style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
                onPress={() => handleShelfPress(segment)}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {revealShelfContent}
      </Animated.View>

      {selectedDate ? (
        <FlatList
          testID="reports-activity-list"
          data={selectedEvents}
          keyExtractor={(ev, i) => String(ev?.id ?? ev?.source_id ?? `ev-${i}`)}
          onScroll={(event) => handleRevealScroll(event.nativeEvent.contentOffset.y)}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <>
              <Animated.View style={{ height: spacerAnim }} />
              {v2Query.isLoading && <Text style={styles.meta}>{SCREEN_STATE_WORDING.loading}</Text>}
              {v2Query.error && <Text style={styles.error}>{SCREEN_STATE_WORDING.failedReports}</Text>}
              <DayPickerStrip rows={v2Rows} selectedDate={selectedDate} onSelect={setSelectedDate} highlightDate={highlightDate} />
              {rawSelectedEvents.length > 0 ? (
                <View style={styles.filterPanel}>
                  {availableGroupOptions.length > 1 ? (
                    <FilterChipRow
                      options={availableGroupOptions.map((option) => ({ id: option.key, label: option.label }))}
                      value={activityGroupFilter}
                      onChange={(next) => {
                        setActivityGroupFilter(next);
                        setActivitySubtypeFilter(null);
                        setActivityLevel3Filter(null);
                      }}
                      style={styles.filterScroll}
                      contentContainerStyle={styles.filterScrollContent}
                      testID="reports-filter-groups"
                    />
                  ) : null}
                  {activityGroupFilter && availableSubtypeOptions.length > 1 ? (
                    <FilterChipRow
                      options={availableSubtypeOptions.map((option) => ({ id: option.key, label: option.label }))}
                      value={activitySubtypeFilter}
                      onChange={(next) => {
                        setActivitySubtypeFilter(next);
                        setActivityLevel3Filter(null);
                      }}
                      style={[styles.filterScroll, styles.filterScrollSubtypes]}
                      contentContainerStyle={styles.filterScrollContent}
                      testID="reports-filter-subtypes"
                    />
                  ) : null}
                  {activitySubtypeFilter === "replacement" && availableLevel3Options.length > 1 ? (
                    <FilterChipRow
                      options={availableLevel3Options.map((option) => ({ id: option.key, label: option.label }))}
                      value={activityLevel3Filter}
                      onChange={setActivityLevel3Filter}
                      style={[styles.filterScroll, styles.filterScrollSubtypes]}
                      contentContainerStyle={styles.filterScrollContent}
                      testID="reports-filter-level3"
                    />
                  ) : null}
                </View>
              ) : null}
            </>
          }
          ListEmptyComponent={
            selectedDayStatus === "idle" || selectedDayStatus === "loading" ? (
              <Text style={styles.meta}>{SCREEN_STATE_WORDING.loadingActivities}</Text>
            ) : selectedDayStatus === "error" ? (
              <Text style={styles.error}>{SCREEN_STATE_WORDING.failedActivities}</Text>
            ) : selectedDayStatus === "success" && rawSelectedEvents.length === 0 ? (
              <Text style={styles.meta}>{SCREEN_STATE_WORDING.noActivitiesDay}</Text>
            ) : selectedDayStatus === "success" && selectedEvents.length === 0 ? (
              <Text style={styles.meta}>{SCREEN_STATE_WORDING.noActivitiesFilter}</Text>
            ) : null
          }
          renderItem={({ item, index }) => {
            const eventKey = String(item?.id ?? item?.source_id ?? `${item?.event_type ?? "ev"}:${item?.effective_at ?? index}`);
            const isOpen = openEventKeys.includes(eventKey);
            return (
              <View key={eventKey}>
                <Pressable onPress={() => toggleEventKey(eventKey)}>
                  <SlimActivityRow event={item} formatMoney={formatMoney} highlight={eventKey === highlightEventKey} />
                </Pressable>
                {isOpen ? <EventExpandedPanel ev={item} formatMoney={formatMoney} formatCount={formatCount} /> : null}
              </View>
            );
          }}
          contentContainerStyle={styles.activityListContent}
        />
      ) : (
        <View style={styles.emptyStateWrap}>
          <Text style={styles.meta}>Select a day above.</Text>
        </View>
      )}

      <Animated.View
        testID="reports-quick-actions"
        pointerEvents={actionsVisible ? "auto" : "none"}
        style={[
          styles.quickActions,
          {
            opacity: actionsAnim,
            transform: [
              {
                translateY: actionsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          testID="reports-quick-replacement"
          accessibilityLabel="Replacement"
          style={styles.quickFab}
          onPress={() => router.push("/orders/new")}
        >
          <Ionicons name="swap-horizontal-outline" size={26} color="#0a7ea4" />
          <View style={styles.quickFabBadge}>
            <Text style={styles.quickFabBadgeText}>+</Text>
          </View>
        </Pressable>
        <Pressable
          testID="reports-quick-refill"
          accessibilityLabel="Refill"
          style={styles.quickFab}
          onPress={() => router.push({ pathname: "/inventory/new", params: { section: "company", tab: "refill" } })}
        >
          <MaterialCommunityIcons name="truck-delivery" size={22} color="#f59e0b" />
          <View style={styles.quickFabBadge}>
            <Text style={styles.quickFabBadgeText}>+</Text>
          </View>
        </Pressable>
        <Pressable
          testID="reports-quick-expense"
          accessibilityLabel="Expense"
          style={styles.quickFab}
          onPress={() => router.push("/expenses/new")}
        >
          <Ionicons name="receipt-outline" size={24} color="#0a7ea4" />
          <View style={styles.quickFabBadge}>
            <Text style={styles.quickFabBadgeText}>+</Text>
          </View>
        </Pressable>
      </Animated.View>

        {/* Sync tooltip */}
        <Modal transparent visible={!!syncInfoDate} animationType="fade" onRequestClose={() => setSyncInfoDate(null)}>
          <Pressable style={styles.syncOverlay} onPress={() => setSyncInfoDate(null)}>
            <Pressable style={styles.syncTooltip} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.syncTitle}>Sync Update</Text>
              <Text style={styles.syncText}>Totals refreshed after closing time to include late entries.</Text>
              <Pressable style={styles.syncClose} onPress={() => setSyncInfoDate(null)}>
                <Text style={styles.syncCloseText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Expense modal (usable) */}
        <ExpenseModal
          visible={expenseModalOpen}
          accessoryId={accessoryId}
          allowAutoFocus={allowExpenseInput}
          expenseTypes={expenseTypes}
          useCustomType={useCustomType}
          setUseCustomType={setUseCustomType}
          expenseType={expenseType}
          setExpenseType={setExpenseType}
          customExpenseType={customExpenseType}
          setCustomExpenseType={setCustomExpenseType}
          expenseAmount={expenseAmount}
          setExpenseAmount={setExpenseAmount}
          expenseNote={expenseNote}
          setExpenseNote={setExpenseNote}
          onClose={() => {
            setExpenseModalOpen(false);
            setAllowExpenseInput(false);
          }}
          onSave={saveExpense}
        />

      </View>
    );

}

/* -----------------------------------------
 * Minimal helper UI components (safe defaults)
 * ----------------------------------------- */

function ExpenseModal(props: {
  visible: boolean;
  accessoryId?: string;
  allowAutoFocus: boolean;
  expenseTypes: string[];
  useCustomType: boolean;
  setUseCustomType: (v: boolean) => void;
  expenseType: string;
  setExpenseType: (v: string) => void;
  customExpenseType: string;
  setCustomExpenseType: (v: string) => void;
  expenseAmount: string;
  setExpenseAmount: (v: string) => void;
  expenseNote: string;
  setExpenseNote: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const {
    visible,
    accessoryId,
    allowAutoFocus,
    expenseTypes,
    useCustomType,
    setUseCustomType,
    expenseType,
    setExpenseType,
    customExpenseType,
    setCustomExpenseType,
    expenseAmount,
    setExpenseAmount,
    expenseNote,
    setExpenseNote,
    onClose,
    onSave,
  } = props;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>{EXPENSE_MODAL_WORDING.title}</Text>

          <View style={styles.rowBetween}>
            <Pressable style={[styles.smallBtn, !useCustomType && styles.smallBtnActive]} onPress={() => setUseCustomType(false)}>
              <Text style={styles.smallBtnText}>{EXPENSE_MODAL_WORDING.preset}</Text>
            </Pressable>
            <Pressable style={[styles.smallBtn, useCustomType && styles.smallBtnActive]} onPress={() => setUseCustomType(true)}>
              <Text style={styles.smallBtnText}>{EXPENSE_MODAL_WORDING.custom}</Text>
            </Pressable>
          </View>

          {!useCustomType ? (
            <View style={styles.chipGrid}>
              {expenseTypes.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.chip, expenseType === t && styles.chipActive]}
                  onPress={() => setExpenseType(t)}
                >
                  <Text style={[styles.chipText, expenseType === t && styles.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <>
              <Text style={styles.modalLabel}>{EXPENSE_MODAL_WORDING.typeLabel}</Text>
              <TextInput
                value={customExpenseType}
                onChangeText={setCustomExpenseType}
                style={styles.input}
                placeholder={EXPENSE_MODAL_WORDING.typePlaceholder}
              />
            </>
          )}

          <Text style={styles.modalLabel}>{EXPENSE_MODAL_WORDING.amountLabel}</Text>
          <TextInput
            value={expenseAmount}
            onChangeText={setExpenseAmount}
            style={styles.input}
            placeholder="0"
            keyboardType="number-pad"
            inputAccessoryViewID={accessoryId}
            autoFocus={allowAutoFocus}
          />

          <Text style={styles.modalLabel}>{EXPENSE_MODAL_WORDING.noteLabel}</Text>
          <TextInput
            value={expenseNote}
            onChangeText={setExpenseNote}
            style={styles.input}
            placeholder={EXPENSE_MODAL_WORDING.notePlaceholder}
            inputAccessoryViewID={accessoryId}
          />

          {Platform.OS === "ios" && accessoryId ? (
            <InputAccessoryView nativeID={accessoryId}>
              <View style={styles.accessory}>
                <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryBtn}>
                  <Text style={styles.accessoryBtnText}>{EXPENSE_MODAL_WORDING.done}</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          ) : null}

          <View style={styles.rowBetween}>
            <Pressable style={[styles.primaryBtn, styles.secondaryBtn]} onPress={onClose}>
              <Text style={styles.primaryBtnText}>{EXPENSE_MODAL_WORDING.cancel}</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onSave}>
              <Text style={styles.primaryBtnText}>{EXPENSE_MODAL_WORDING.save}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* -----------------------------------------
 * Styles (minimal, consistent)
 * ----------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 14,
    backgroundColor: "#f6f7f9",
  },
  meta: { fontSize: 12, color: "#475569", fontFamily: FontFamilies.regular },
  error: { fontSize: 12, color: "#b91c1c", marginTop: 6, fontFamily: FontFamilies.semibold },
  revealLayer: {
    position: "absolute",
    top: 10,
    left: 14,
    right: 14,
    zIndex: 20,
  },
  segmentBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#dbe3ee",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  segmentButtonActive: {
    backgroundColor: "#0a7ea4",
  },
  segmentText: {
    fontSize: 13,
    color: "#475569",
    fontFamily: FontFamilies.semibold,
  },
  segmentTextActive: {
    color: "#fff",
  },
  revealShelfBody: {
    marginTop: 10,
  },
  reusedShelfWrap: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  reusedSection: {
    marginTop: 0,
  },
  activityListContent: {
    paddingTop: 10,
    paddingBottom: 236,
  },
  filterPanel: {
    marginTop: 18,
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 12,
  },
  filterScrollSubtypes: {
    marginTop: 10,
  },
  emptyStateWrap: {
    flex: 1,
    paddingTop: 18,
  },
  quickActions: {
    position: "absolute",
    right: 18,
    bottom: 88,
    gap: 10,
    zIndex: 25,
  },
  quickFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  quickFabBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  quickFabBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 12,
    fontFamily: FontFamilies.extrabold,
  },

  tabRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 10, flexWrap: "wrap" },
  tabChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  tabChipActive: { backgroundColor: "#0a7ea4" },
  tabChipText: { fontSize: 12, color: "#0f172a", fontWeight: "600", fontFamily: FontFamilies.semibold },
  tabChipTextActive: { color: "white" },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  date: { fontSize: 14, fontWeight: "700", color: "#0f172a", fontFamily: FontFamilies.semibold },

  statusRow: { flexDirection: "row", alignItems: "center" },
  statusBelow: { marginTop: 6 },
  statusText: { fontSize: 12, fontWeight: "700", fontFamily: FontFamilies.semibold },
  paid: { color: "#16a34a" },
  unpaid: { color: "#b91c1c" },

  orderMeta: { fontSize: 12, fontWeight: "600", color: "#0f172a", fontFamily: FontFamilies.semibold },

  expanded: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0" },
  expandedTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 8, fontFamily: FontFamilies.extrabold },
  expandedPanel: { backgroundColor: "#eef6ff", borderColor: "#bfdbfe" },

  quickSummary: { backgroundColor: "#ffffff" },
  quickDetailsButton: { marginTop: 10, paddingVertical: 10, borderRadius: 10, backgroundColor: "#0a7ea4", alignItems: "center" },
  quickDetailsText: { color: "white", fontWeight: "800", fontFamily: FontFamilies.bold },

  labeledRowGroupCard: { backgroundColor: "#ffffff" },

  badgeRow: { flexDirection: "row", gap: Spacing.md, alignItems: "center" },
  pendingBadge: { backgroundColor: "#fde68a", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pendingBadgeText: { fontSize: 11, fontWeight: "800", color: "#78350f", fontFamily: FontFamilies.bold },

  v2CashLabel: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 6, fontFamily: FontFamilies.bold },
  v2InvCompactValue: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 8, fontFamily: FontFamilies.bold },
  v2CashBox: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "#f8fafc" },
  v2InvLabel: { fontSize: 12, fontWeight: "900", marginBottom: 6, fontFamily: FontFamilies.extrabold },
  v2MetricLabelSmall: { fontSize: 12, fontWeight: "800", fontFamily: FontFamilies.bold },

  v2EventSummaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  v2EventSummaryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  v2EventSummaryText: { fontSize: 11, fontWeight: "900", color: "white", fontFamily: FontFamilies.extrabold },
  missingInlineBox: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    alignItems: "flex-end",
    minWidth: 120,
    maxWidth: "100%",
  },
  missingMiniLabel: { fontSize: 10, fontWeight: "900", color: "#b91c1c", textAlign: "right", fontFamily: FontFamilies.extrabold },
  missingMiniValue: { marginTop: 2, fontSize: 11, fontWeight: "900", color: "#b91c1c", textAlign: "right", fontFamily: FontFamilies.extrabold },
  auditValue: { marginTop: 2, fontSize: 11, fontWeight: "600", color: "#1f2937", textAlign: "right", fontFamily: FontFamilies.semibold },
  auditAlert: { fontWeight: "900", color: "#b91c1c", fontFamily: FontFamilies.extrabold },
  collapsedEventRow: { justifyContent: "flex-end", marginTop: 0, flexWrap: "wrap" },
  collapsedEventChip: { paddingHorizontal: 6, paddingVertical: 3 },
  collapsedEventText: { fontSize: 10 },
  collapsedChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },

  problemLine: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#b91c1c", fontFamily: FontFamilies.semibold },

  v2Timeline: { backgroundColor: "#ffffff" },

  // balances + header styles live in components/reports
  adjustmentRow: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  adjustmentInfo: { flex: 1, paddingRight: 8 },
  adjustmentTitle: { fontSize: 12, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  adjustmentReason: { marginTop: 2, fontSize: 11, color: "#64748b", fontFamily: FontFamilies.regular },
  adjustmentActions: { flexDirection: "row", gap: 12 },
  relationshipGood: { color: "#2563eb" },
  relationshipBad: { color: "#b91c1c" },
  summaryGrid: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryChip: {
    flexGrow: 1,
    minWidth: 120,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  summaryChipCompact: { minWidth: 0, flex: 1 },
  summaryChipBad: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  summaryChipLabel: { fontSize: 10, fontWeight: "800", color: "#334155", fontFamily: FontFamilies.bold },
  summaryChipLabelStack: { gap: 2 },
  summaryChipLabelLine: { fontSize: 10, fontWeight: "800", color: "#334155", lineHeight: 12, fontFamily: FontFamilies.bold },
  summaryChipValue: { marginTop: 6, fontSize: 12, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  summaryChipValueOk: { color: "#16a34a" },
  summaryChipValueBad: { color: "#b91c1c" },
  summaryRow: { width: "100%", flexDirection: "row", gap: 8 },
  table: { padding: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  tableExpanded: { backgroundColor: "#eef2ff" },
  tableRow: { fontSize: 12, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  tableMeta: { marginTop: 6, fontSize: 11, color: "#64748b", fontWeight: "700", fontFamily: FontFamilies.semibold },

  subCard: { marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  subCardTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", marginBottom: 6, fontFamily: FontFamilies.extrabold },
  subCardRow: { fontSize: 12, fontWeight: "800", color: "#334155", fontFamily: FontFamilies.bold },

  eventCard: {
    marginTop: 10,
    paddingTop: 4,
    paddingBottom: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  eventHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: Spacing.lg, marginBottom: 0 },
  eventHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, flexWrap: "wrap" },
  eventHeaderRight: { alignItems: "flex-end" },
  eventHeaderRightStack: { alignItems: "flex-end", gap: Spacing.xs },
  eventHeaderLeft: { flex: 1, rowGap: 4 },
  eventBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, justifyContent: "flex-end" },
  eventBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  eventBadgeOrder: { backgroundColor: "#2563eb" },
  eventBadgeRefill: { backgroundColor: "#f97316" },
  eventBadgeText: { color: "white", fontSize: FontSizes.sm, fontWeight: "900", fontFamily: FontFamilies.extrabold },
  eventTypeText: { fontSize: FontSizes.md, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  eventLabelText: { fontSize: 11, fontWeight: "800", color: "#64748b", fontFamily: FontFamilies.bold },
  eventTimePill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  eventTimeText: { fontSize: FontSizes.xs, fontWeight: "800", color: "#475569", fontFamily: FontFamilies.semibold },
  eventMetaBlock: { marginTop: 4 },
  eventMetaBlockTight: { marginTop: -2 },
  eventMetaText: { fontSize: 12, fontWeight: "700", color: "#334155", fontFamily: FontFamilies.semibold },
  eventTypePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  eventTypePillText: { color: "white", fontSize: FontSizes.md, fontWeight: "900", fontFamily: FontFamilies.extrabold },
  eventCustomerName: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 0, lineHeight: 18, fontFamily: FontFamilies.extrabold },
  eventCustomerNameTight: { marginTop: 0, marginBottom: 2 },
  eventMetaSmall: { fontSize: 12, fontWeight: "700", color: "#64748b", marginTop: 0, lineHeight: 14, fontFamily: FontFamilies.semibold },
  eventMetaSmallTight: { marginTop: 2 },
  eventMetaRight: { textAlign: "right" },
  eventSummaryBlock: { marginTop: 4 },
  eventSummaryLine: { marginTop: 0, fontSize: 12, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  eventSummaryLineTight: { marginTop: 2 },
  eventSummaryLeft: { flex: 1 },
  eventSummaryRight: { textAlign: "right" },
  eventSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginTop: 2 },
  eventSummaryRowTight: { marginTop: 0 },
  eventSummaryAlert: { color: "#b91c1c", marginTop: 0, fontFamily: FontFamilies.semibold },
  eventSummaryOk: { color: "#16a34a", marginTop: 0, fontFamily: FontFamilies.semibold },
  expenseTitle: { color: "#166534" },
  refillTitle: { color: "#0a7ea4" },
  adjustTitleTight: { marginBottom: 0 },
  adjustHeaderLeft: { rowGap: 0 },
  adjustSummaryRow: { marginTop: 0 },
  eventCreatedAtText: { marginTop: 6, fontSize: 11, fontWeight: "700", color: "#64748b", fontFamily: FontFamilies.semibold },
  eventExpandedRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  eventExpandedPanel: { paddingHorizontal: 12, paddingBottom: 8 },
  eventExpandedEmpty: { marginTop: 6, fontSize: 12, color: "#64748b", fontFamily: FontFamilies.semibold },

  eventSection: { marginTop: 10 },
  eventSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  eventSectionDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#0a7ea4" },
  eventSectionTitle: { fontSize: 11, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },

  deltaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  inventoryRow: { flexDirection: "row", gap: 8 },
  deltaBox: {
    position: "relative",
    paddingTop: 32,
    paddingRight: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    backgroundColor: "#f8fafc",
    minWidth: 140,
    minHeight: 84,
    flexGrow: 1,
  },
  deltaBoxCompact: { minWidth: 0, flex: 1 },
  deltaBoxPlaceholder: { opacity: 0 },
  deltaBoxLabel: { fontSize: 11, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  deltaBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#0f172a",
  },
  deltaBadgeNeutral: { backgroundColor: "#64748b" },
  deltaBadgePositive: { backgroundColor: "#16a34a" },
  deltaBadgeNegative: { backgroundColor: "#b91c1c" },
  deltaBadgeSmall: { paddingHorizontal: 5, paddingVertical: 1 },
  deltaBadgeText: { fontSize: 11, fontWeight: "900", color: "white", fontFamily: FontFamilies.extrabold },
  deltaBadgeTextSmall: { fontSize: 10 },
  deltaBoxRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 18 },
  deltaBoxValue: { fontSize: 11, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  deltaBoxArrow: { fontSize: 11, fontWeight: "900", color: "#0a7ea4", fontFamily: FontFamilies.extrabold },
  deltaValueGood: { color: "#16a34a" },
  deltaValueBad: { color: "#b91c1c" },
  valueBoxRow: { marginTop: 10, alignItems: "center", justifyContent: "center", minHeight: 18 },
  valueBoxValue: { fontSize: 11, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  valueBoxValueOk: { color: "#16a34a" },
  valueBoxValueBad: { color: "#b91c1c" },
  orderMoneyRow: { flexDirection: "row", gap: 8 },

  dayActions: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 },
  dayIconBtn: { padding: 6, borderRadius: 10, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.35)", padding: 14, justifyContent: "flex-end" },
  modalCard: { backgroundColor: "white", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 10, fontFamily: FontFamilies.extrabold },
  modalLabel: { marginTop: 10, fontSize: 12, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  input: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  half: { width: "48%" },
  primaryBtn: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#0a7ea4", flex: 1, alignItems: "center" },
  secondaryBtn: { backgroundColor: "#64748b", marginRight: 10 },
  primaryBtnText: { color: "white", fontWeight: "900", fontFamily: FontFamilies.extrabold },

  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#0a7ea4" },
  smallBtnDanger: { backgroundColor: "#b91c1c" },
  smallBtnActive: { backgroundColor: "#0f172a" },
  smallBtnText: { color: "white", fontWeight: "900", fontSize: 12, fontFamily: FontFamilies.extrabold },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: "#e2e8f0" },
  chipDisabled: { opacity: 0.6 },
  chipActive: { backgroundColor: "#0a7ea4" },
  chipText: { fontSize: 12, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  chipTextActive: { color: "white" },

  // iOS accessory
  accessory: { backgroundColor: "#f1f5f9", padding: 8, borderTopWidth: 1, borderTopColor: "#e2e8f0", alignItems: "flex-end" },
  accessoryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#0a7ea4" },
  accessoryBtnText: { color: "white", fontWeight: "900", fontFamily: FontFamilies.extrabold },

  // Sync tooltip
  syncOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)", justifyContent: "center", padding: 20 },
  syncTooltip: { backgroundColor: "white", padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  syncTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  syncText: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#334155", fontFamily: FontFamilies.semibold },
  syncClose: { marginTop: 12, alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#0a7ea4" },
  syncCloseText: { color: "white", fontWeight: "900", fontFamily: FontFamilies.extrabold },
});


