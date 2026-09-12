// storage.js
// -----------------------------------------------------------------------
// Everything related to data persistence and calorie allocation math
// lives here. Data model: an array of "weeks", each with 7 days. The
// last week in the array is always the active week (the one currently
// being logged).
// -----------------------------------------------------------------------

const STORAGE_KEY = "calorieLedgerState";
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const Storage = {
  // Returns the full saved state, or null if nothing has been saved yet
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

  // Returns the most recent Sunday (today itself, if today is Sunday)
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

  // Creates a brand new empty week based on the daily target
  createWeek(dailyTarget, startDate = new Date()) {
    const sunday = this.getMostRecentSunday(startDate);
    return {
      weekStartDate: this.formatDate(sunday),
      dailyTarget: dailyTarget,
      currentDayIndex: 0,
      days: DAY_NAMES.map((name) => ({
        name,
        allocated: dailyTarget,
        consumed: null, // null = not logged yet (renders as "–")
        locked: false,
      })),
    };
  },

  // ------------------------------------------------------------------
  // The single unified rule for redistributing calories across open days
  // remainingBudget = (dailyTarget × 7) − sum of consumed for locked days
  // newAllocated for each open day = remainingBudget ÷ number of open days
  // ------------------------------------------------------------------
  recalcAllocation(week) {
    const weeklyBudget = week.dailyTarget * 7;
    const lockedConsumedSum = week.days
      .filter((d) => d.locked)
      .reduce((sum, d) => sum + (d.consumed || 0), 0);

    const openDays = week.days.filter((d) => !d.locked);
    if (openDays.length === 0) return; // the whole week is locked, nothing to redistribute

    const remainingBudget = weeklyBudget - lockedConsumedSum;
    const newAllocated = Math.round(remainingBudget / openDays.length);

    openDays.forEach((d) => {
      d.allocated = newAllocated;
    });
  },

  // Updates the active (unlocked) day's consumed value — live recalculates
  // the allocation for upcoming days
  updateActiveDayConsumed(week, value) {
    const day = week.days[week.currentDayIndex];
    day.consumed = value;
    this.recalcAllocation(week);
  },

  // Locks the current day and advances the pointer to the next one
  lockCurrentDay(week) {
    const day = week.days[week.currentDayIndex];
    if (day.consumed === null) day.consumed = 0;
    day.locked = true;

    if (week.currentDayIndex < 6) {
      week.currentDayIndex += 1;
    }
    this.recalcAllocation(week);
  },

  // Edits a past (locked) day from history — only recalculates the
  // allocation for the still-open days that come after it
  editHistoricalDay(week, dayIndex, newValue) {
    week.days[dayIndex].consumed = newValue;
    this.recalcAllocation(week);
  },

  // Target vs. actual totals for a full week (includes the active day's
  // current value)
  getWeekTotals(week) {
    const totalTarget = week.dailyTarget * 7;
    const totalActual = week.days.reduce((sum, d) => sum + (d.consumed || 0), 0);
    return { totalTarget, totalActual, diff: totalActual - totalTarget };
  },

  // Has midnight passed for the active day? (compares today's real date
  // against weekStartDate + number of locked days)
  isMidnightPassed(week) {
    const sunday = new Date(week.weekStartDate);
    const expectedActiveDate = new Date(sunday);
    expectedActiveDate.setDate(sunday.getDate() + week.currentDayIndex);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expectedActiveDate.setHours(0, 0, 0, 0);

    return today > expectedActiveDate && week.currentDayIndex < 6;
  },
};
