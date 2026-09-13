// storage.js
// -----------------------------------------------------------------------
// Everything related to data persistence and calorie allocation math
// lives here.
//
// Data model: state.weeks is an array of week objects, each with a
// unique weekStartDate and a status:
//   - "active": the one live week you're currently logging day by day.
//     There is always exactly one of these. Its days redistribute
//     allocation automatically as you go (the core budgeting logic).
//   - "past": a completed week. This includes weeks that finished
//     naturally (all 7 days locked in sequence) AND weeks added
//     manually via "Add Past Week" for record-keeping. Past weeks
//     never redistribute — each day simply keeps the flat dailyTarget,
//     and you can fill in any day, in any order, freely.
// -----------------------------------------------------------------------

const STORAGE_KEY = "calorieLedgerState";
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const Storage = {
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse saved state:", e);
      return null;
    }
  },

  save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  // Returns the most recent Sunday on/before the given date
  getMostRecentSunday(date = new Date()) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  },

  formatDate(date) {
    const d = new Date(date);
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
  },

  // Creates a new week object. `status` is "active" or "past". `id` is
  // a stable unique identifier — separate from weekStartDate — so two
  // weeks can never be confused with each other even if (through a
  // bug or manual entry) they end up sharing the same date.
  createWeek(dailyTarget, startDate = new Date(), status = "active") {
    const sunday = this.getMostRecentSunday(startDate);
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      weekStartDate: this.formatDate(sunday),
      dailyTarget: dailyTarget,
      status: status,
      currentDayIndex: 0,
      days: DAY_NAMES.map((name) => ({
        name,
        allocated: dailyTarget,
        consumed: null, // null = not logged yet
        locked: false,
      })),
    };
  },

  getActiveWeek(state) {
    return state.weeks.find((w) => w.status === "active") || null;
  },

  // If there's no active week (the last one just completed), start a
  // fresh one for the following Sunday so the app keeps working
  // indefinitely.
  ensureActiveWeek(state) {
    if (this.getActiveWeek(state)) return;

    const sorted = [...state.weeks].sort((a, b) =>
      a.weekStartDate.localeCompare(b.weekStartDate)
    );
    const lastWeek = sorted[sorted.length - 1];
    const target = state.defaultDailyTarget || (lastWeek ? lastWeek.dailyTarget : 1200);

    let nextStart = new Date();
    if (lastWeek) {
      nextStart = new Date(lastWeek.weekStartDate);
      nextStart.setDate(nextStart.getDate() + 7);
    }

    const newWeek = this.createWeek(target, nextStart, "active");
    state.weeks.push(newWeek);
  },

  // ------------------------------------------------------------------
  // The single unified rule for redistributing calories across open
  // days of the ACTIVE week only:
  // remainingBudget = (dailyTarget × 7) − sum of consumed for locked days
  // newAllocated for each open day = remainingBudget ÷ number of open days
  // ------------------------------------------------------------------
  recalcAllocation(week) {
    const weeklyBudget = week.dailyTarget * 7;
    const lockedConsumedSum = week.days
      .filter((d) => d.locked)
      .reduce((sum, d) => sum + (d.consumed || 0), 0);

    const openDays = week.days.filter((d) => !d.locked);
    if (openDays.length === 0) return;

    const remainingBudget = weeklyBudget - lockedConsumedSum;
    const newAllocated = Math.round(remainingBudget / openDays.length);

    openDays.forEach((d) => {
      d.allocated = newAllocated;
    });
  },

  // Sets a day's consumed value. For the active week this also
  // recalculates allocation for the remaining open days. For past
  // weeks, allocation stays flat — nothing to redistribute.
  setDayConsumed(week, dayIndex, value) {
    week.days[dayIndex].consumed = value;
    if (week.status === "active") {
      this.recalcAllocation(week);
    }
  },

  // Locks the current day of the active week and advances the pointer.
  // If Saturday was just locked, the week is complete and flips to "past".
  lockCurrentDay(week) {
    const day = week.days[week.currentDayIndex];
    if (day.consumed === null) day.consumed = 0;
    day.locked = true;

    if (week.currentDayIndex < 6) {
      week.currentDayIndex += 1;
      this.recalcAllocation(week);
    } else {
      week.status = "past";
    }
  },

  // Target vs. actual totals for a full week
  getWeekTotals(week) {
    const totalTarget = week.dailyTarget * 7;
    const totalActual = week.days.reduce((sum, d) => sum + (d.consumed || 0), 0);
    return { totalTarget, totalActual, diff: totalActual - totalTarget };
  },

  // Has midnight passed for the active day of the active week?
  isMidnightPassed(week) {
    if (week.status !== "active" || week.currentDayIndex >= 6) return false;

    const sunday = new Date(week.weekStartDate);
    const expectedActiveDate = new Date(sunday);
    expectedActiveDate.setDate(sunday.getDate() + week.currentDayIndex);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expectedActiveDate.setHours(0, 0, 0, 0);

    return today > expectedActiveDate;
  },
};
