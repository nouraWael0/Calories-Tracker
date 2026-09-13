// app.js
// -----------------------------------------------------------------------
// App logic + rendering. Single page: all weeks render from oldest (top)
// to newest (bottom) by weekStartDate. Exactly one week has
// status "active" (the one you're currently logging); everything else
// is "past" — either finished naturally or added manually for
// record-keeping.
//
// Every week has a unique `id` (separate from its display date) so two
// weeks can never be confused with each other, even if they happen to
// share the same weekStartDate.
// -----------------------------------------------------------------------

let state = Storage.load();
const root = document.getElementById("app");

// ---------- Entry point ----------
function init() {
  if (!state) {
    renderOnboarding();
    return;
  }

  // Migration: older saved data may have weeks without an `id` — patch
  // them in place so every week has one going forward.
  state.weeks.forEach((week) => {
    if (!week.id) {
      week.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
  });

  const activeWeek = Storage.getActiveWeek(state);
  if (activeWeek) {
    while (Storage.isMidnightPassed(activeWeek)) {
      Storage.lockCurrentDay(activeWeek);
    }
  }
  Storage.ensureActiveWeek(state);
  Storage.save(state);

  render();
}

// ---------- First-run screen: set the daily target ----------
function renderOnboarding() {
  root.innerHTML = `
    <div class="onboarding">
      <h1>Calorie Ledger</h1>
      <p>What's your daily calorie target?</p>
      <input type="number" id="targetInput" placeholder="e.g. 1200" inputmode="numeric" />
      <button id="startBtn">Start</button>
    </div>
  `;
  document.getElementById("startBtn").addEventListener("click", () => {
    const val = parseInt(document.getElementById("targetInput").value, 10);
    if (!val || val <= 0) return;
    state = { weeks: [Storage.createWeek(val, new Date(), "active")] };
    Storage.save(state);
    render();
  });
}

// ---------- Color / arrow logic ----------
// Shared classification for any "closed" diff (a finished day, or the
// weekly average vs target) — the ±200 threshold and colors are always
// applied at the same DAILY scale.
function classifyDiff(diff) {
  if (diff === 0) return { text: "✓", colorClass: "neutral", arrow: "" };

  const absDiff = Math.abs(diff);
  const arrow = diff > 0 ? "↑" : "↓";

  if (absDiff < 200) return { text: fmt(absDiff), colorClass: "yellow", arrow };
  if (diff >= 200) return { text: fmt(absDiff), colorClass: "red", arrow };
  return { text: fmt(absDiff), colorClass: "green", arrow };
}

// Returns { text, colorClass, arrow } describing how a day's diff cell
// should render.
// `isActive` = this is the live, currently-open day of the active week.
// `dailyTarget` = the week's flat daily target (used for FINISHED days —
// intentionally NOT the day's dynamically-redistributed `allocated`
// value, so a day's grade always reflects the original daily target,
// not how the week's budget happened to get rebalanced around it).
function getDayVisual(day, isActive, dailyTarget) {
  if (day.consumed === null) {
    return { text: "–", colorClass: "muted", arrow: "" };
  }

  if (isActive) {
    // Active day: show "remaining" against this day's live allocation
    // (the redistributed budget), since that's what tells you how much
    // you actually have left to eat today.
    const diff = day.consumed - day.allocated;
    if (diff === 0) return { text: "✓", colorClass: "neutral", arrow: "" };

    if (diff < 0) {
      const remaining = Math.abs(diff);
      const color = remaining >= 200 ? "green" : "neutral";
      return { text: `${fmt(remaining)} left`, colorClass: color, arrow: "↓" };
    } else {
      const color = diff >= 200 ? "red" : "neutral";
      return { text: `${fmt(diff)}+`, colorClass: color, arrow: "↑" };
    }
  }

  // Finished day (locked, or any day in a past week): graded against
  // the flat daily target, not the redistributed allocation.
  const diff = day.consumed - dailyTarget;
  return classifyDiff(diff);
}

function fmt(n) {
  return Number(n).toLocaleString("en-US");
}

// ---------- Render a single week block ----------
function renderWeekBlock(week) {
  const isActiveWeek = week.status === "active";
  const { totalActual } = Storage.getWeekTotals(week);

  const rows = week.days
    .map((day, i) => {
      const isActive = isActiveWeek && i === week.currentDayIndex && !day.locked;
      const visual = getDayVisual(day, isActive, week.dailyTarget);

      // Editable: on the active week, only the live day or already-
      // locked (historical) days. On a past week, every day is always
      // freely editable, in any order.
      const editable = isActiveWeek ? isActive || day.locked : true;

      // The number shown next to the day: what was actually eaten if
      // logged, otherwise the allocation for that day (in gray) as a
      // preview/placeholder.
      const consumedDisplay = day.consumed !== null ? fmt(day.consumed) : fmt(day.allocated);
      const consumedClass = day.consumed !== null ? "" : "muted";

      return `
        <div class="day-row ${isActive ? "active" : ""}" data-week="${week.id}" data-day="${i}">
          <span class="day-name">${day.name}</span>
          <span class="day-consumed ${consumedClass}">${consumedDisplay}</span>
          <span class="day-diff ${visual.colorClass}">
            ${visual.arrow ? `<span class="arrow ${visual.colorClass}">${visual.arrow}</span>` : ""}
            ${visual.text}
          </span>
          ${editable ? `<button class="edit-btn" data-action="edit" data-week="${week.id}" data-day="${i}">${isActive ? "Set" : "✎"}</button>` : ""}
        </div>
      `;
    })
    .join("");

  // The weekly total row shows the DAILY AVERAGE actually eaten (not a
  // raw week-total fraction), so it reads on the same scale as every
  // day row above it. The diff next to it compares that average
  // against the daily target, using the same ±200 rule.
  const dailyAverage = Math.round(totalActual / 7);
  const totalDiff = dailyAverage - week.dailyTarget;
  const totalVisual = classifyDiff(totalDiff);

  return `
    <section class="week-block ${isActiveWeek ? "current" : "past"}">
      <div class="week-header">
        <span>${week.weekStartDate}</span>
        <span class="week-header-actions">
          <button class="icon-btn" data-action="delete-week" data-week="${week.id}" title="Delete this week">×</button>
          ${isActiveWeek ? `<button class="icon-btn" data-action="add-past-week" title="Log a past week">+</button>` : ""}
          ${isActiveWeek ? `<button data-action="edit-target" data-week="${week.id}">⚙ Target: ${fmt(week.dailyTarget)}</button>` : ""}
        </span>
      </div>
      ${rows}
      <div class="day-row total-row">
        <span class="day-name">Total</span>
        <span class="day-consumed">${fmt(dailyAverage)}</span>
        <span class="day-diff ${totalVisual.colorClass}">
          ${totalVisual.arrow ? `<span class="arrow ${totalVisual.colorClass}">${totalVisual.arrow}</span>` : ""}
          ${totalVisual.text}
        </span>
      </div>
    </section>
  `;
}

// ---------- Full render ----------
function render() {
  const sortedWeeks = [...state.weeks].sort((a, b) =>
    a.weekStartDate.localeCompare(b.weekStartDate)
  );

  const blocks = sortedWeeks.map((week) => renderWeekBlock(week)).join("");

  root.innerHTML = `
    <div class="ledger">
      ${blocks}
      <button class="reset-link" data-action="reset-data">Reset all data</button>
    </div>
  `;
  attachEvents();

  // Auto-scroll to the bottom (most recent content)
  window.scrollTo(0, document.body.scrollHeight);
}

// ---------- Helpers ----------
function findWeek(weekId) {
  return state.weeks.find((w) => w.id === weekId);
}

// ---------- Events ----------
function attachEvents() {
  document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const weekId = e.target.dataset.week;
      const dayIndex = parseInt(e.target.dataset.day, 10);
      handleDayEdit(weekId, dayIndex);
    });
  });

  document.querySelectorAll('[data-action="edit-target"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      handleTargetEdit(e.target.dataset.week);
    });
  });

  document.querySelectorAll('[data-action="delete-week"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      handleDeleteWeek(e.currentTarget.dataset.week);
    });
  });

  const addPastBtn = document.querySelector('[data-action="add-past-week"]');
  if (addPastBtn) addPastBtn.addEventListener("click", handleAddPastWeek);

  const resetBtn = document.querySelector('[data-action="reset-data"]');
  if (resetBtn) resetBtn.addEventListener("click", handleResetData);
}

function handleDayEdit(weekId, dayIndex) {
  const week = findWeek(weekId);
  const day = week.days[dayIndex];
  const isActiveWeek = week.status === "active";
  const isActiveDay = isActiveWeek && dayIndex === week.currentDayIndex && !day.locked;

  // Only the active week's already-locked days need a confirmation —
  // past weeks (whether finished naturally or added manually) are
  // always freely editable, no warning needed.
  if (isActiveWeek && day.locked) {
    const confirmed = confirm("This day is locked. Do you want to edit history?");
    if (!confirmed) return;
  }

  const input = prompt(`${day.name} calories:`, day.consumed ?? "");
  if (input === null) return;
  const value = parseInt(input, 10);
  if (isNaN(value) || value < 0) return;

  Storage.setDayConsumed(week, dayIndex, value);

  if (isActiveDay) {
    const lockNow = confirm("Saved. Lock this day now and move to the next one?");
    if (lockNow) {
      Storage.lockCurrentDay(week);
      Storage.ensureActiveWeek(state);
    }
  }

  Storage.save(state);
  render();
}

function handleTargetEdit(weekId) {
  const week = findWeek(weekId);
  const input = prompt("New daily target:", week.dailyTarget);
  if (input === null) return;
  const value = parseInt(input, 10);
  if (isNaN(value) || value <= 0) return;

  const scope = confirm(
    "Click 'OK' to apply this to this week only, or 'Cancel' to make it the default target for upcoming weeks without changing this week."
  );

  if (scope) {
    week.dailyTarget = value;
    Storage.recalcAllocation(week);
  } else {
    state.defaultDailyTarget = value;
  }

  Storage.save(state);
  render();
}

// Deletes a single week by its unique id — safe even if another week
// happens to share the same display date. If the deleted week was the
// active one, a fresh active week is created right after.
function handleDeleteWeek(weekId) {
  const week = findWeek(weekId);
  if (!week) return;

  const confirmed = confirm(`Delete the week of ${week.weekStartDate}? This can't be undone.`);
  if (!confirmed) return;

  state.weeks = state.weeks.filter((w) => w.id !== weekId);
  Storage.ensureActiveWeek(state);
  Storage.save(state);
  render();
}

// Adds a fully past week for record-keeping. All 7 days can be filled
// in freely, in any order, with a flat allocation (no redistribution).
function handleAddPastWeek() {
  const wantsToLog = confirm("Do you want to log a past week?");
  if (!wantsToLog) return;

  const dateInput = prompt("Week start date (any day in that week), format YYYY-MM-DD:");
  if (!dateInput) return;

  const parsedDate = new Date(dateInput);
  if (isNaN(parsedDate.getTime())) {
    alert("Couldn't read that date. Please use the format YYYY-MM-DD, e.g. 2026-08-16.");
    return;
  }

  const defaultTarget =
    state.defaultDailyTarget ||
    (state.weeks.length ? state.weeks[state.weeks.length - 1].dailyTarget : 1200);
  const targetInput = prompt("Daily target for that week:", defaultTarget);
  if (targetInput === null) return;
  const target = parseInt(targetInput, 10);
  if (isNaN(target) || target <= 0) return;

  const newWeek = Storage.createWeek(target, parsedDate, "past");

  const sameDateExists = state.weeks.some((w) => w.weekStartDate === newWeek.weekStartDate);
  if (sameDateExists) {
    const proceedAnyway = confirm(
      "A week starting on this Sunday already exists. Add it anyway as a separate entry?"
    );
    if (!proceedAnyway) return;
  }

  state.weeks.push(newWeek);
  Storage.save(state);
  render();
}

// Wipes everything and goes back to the first-run screen. Useful for
// clearing test entries before starting to log for real.
function handleResetData() {
  const sure = confirm("This deletes ALL logged weeks permanently. Are you sure?");
  if (!sure) return;
  const reallySure = confirm("Really sure? This can't be undone.");
  if (!reallySure) return;

  localStorage.removeItem("calorieLedgerState");
  state = null;
  renderOnboarding();
}

init();
