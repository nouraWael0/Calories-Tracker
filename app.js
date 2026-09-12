// app.js
// -----------------------------------------------------------------------
// App logic + rendering. Single page: all weeks render from oldest (top)
// to newest (bottom) by weekStartDate. Exactly one week has
// status "active" (the one you're currently logging); everything else
// is "past" — either finished naturally or added manually for
// record-keeping.
// -----------------------------------------------------------------------

let state = Storage.load();
const root = document.getElementById("app");

// ---------- Entry point ----------
function init() {
  if (!state) {
    renderOnboarding();
    return;
  }

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
// Returns { text, colorClass, arrow } describing how a day's diff cell
// should render. `isActive` = this is the live, currently-open day of
// the active week.
function getDayVisual(day, isActive) {
  if (day.consumed === null) {
    return { text: "–", colorClass: "muted", arrow: "" };
  }

  const diff = day.consumed - day.allocated;

  if (isActive) {
    // Active day: show "remaining" instead of the raw diff
    if (diff === 0) return { text: "✓", colorClass: "neutral", arrow: "" };

    if (diff < 0) {
      const remaining = Math.abs(diff);
      const color = remaining >= 200 ? "green" : "neutral";
      return { text: `${fmt(remaining)} left`, colorClass: color, arrow: "↓" };
    } else {
      const color = diff >= 200 ? "red" : "neutral";
      return { text: `${fmt(diff)}+`, colorClass: color, arrow: "↑" };
    }
  } else {
    // Finished day (locked, or any day in a past week) / total row
    if (diff === 0) return { text: "✓", colorClass: "neutral", arrow: "" };

    const absDiff = Math.abs(diff);
    const arrow = diff > 0 ? "↑" : "↓";

    if (absDiff < 200) return { text: `${arrow}${fmt(absDiff)}`, colorClass: "yellow", arrow };
    if (diff >= 200) return { text: `${arrow}${fmt(absDiff)}`, colorClass: "red", arrow };
    return { text: `${arrow}${fmt(absDiff)}`, colorClass: "green", arrow };
  }
}

function fmt(n) {
  return Number(n).toLocaleString("en-US");
}

// ---------- Render a single week block ----------
function renderWeekBlock(week) {
  const isActiveWeek = week.status === "active";
  const { totalTarget, totalActual, diff } = Storage.getWeekTotals(week);

  const rows = week.days
    .map((day, i) => {
      const isActive = isActiveWeek && i === week.currentDayIndex && !day.locked;
      const visual = getDayVisual(day, isActive);

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
        <div class="day-row ${isActive ? "active" : ""}" data-week="${week.weekStartDate}" data-day="${i}">
          <span class="day-name">${day.name}</span>
          <span class="day-consumed ${consumedClass}">${consumedDisplay}</span>
          <span class="day-diff ${visual.colorClass}">
            ${visual.arrow ? `<span class="arrow ${visual.colorClass}">${visual.arrow}</span>` : ""}
            ${visual.text}
          </span>
          ${editable ? `<button class="edit-btn" data-action="edit" data-week="${week.weekStartDate}" data-day="${i}">${isActive ? "Set" : "✎"}</button>` : ""}
        </div>
      `;
    })
    .join("");

  const totalColor =
    diff === 0 ? "neutral" : Math.abs(diff) < 200 ? "yellow" : diff > 0 ? "red" : "green";
  const totalArrow = diff === 0 ? "" : diff > 0 ? "↑" : "↓";

  return `
    <section class="week-block ${isActiveWeek ? "current" : "past"}">
      <div class="week-header">
        <span>${week.weekStartDate}</span>
        ${isActiveWeek ? `<button data-action="edit-target" data-week="${week.weekStartDate}">⚙ Target: ${fmt(week.dailyTarget)}</button>` : ""}
      </div>
      ${rows}
      <div class="day-row total-row">
        <span class="day-name">Total</span>
        <span class="day-consumed">${fmt(totalActual)} / ${fmt(totalTarget)}</span>
        <span class="day-diff ${totalColor}">
          ${totalArrow ? `<span class="arrow ${totalColor}">${totalArrow}</span>` : ""}
          ${fmt(Math.abs(diff))}
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
      <button class="add-past-week-btn" data-action="add-past-week">+ Add Past Week</button>
      ${blocks}
    </div>
  `;
  attachEvents();

  // Auto-scroll to the bottom (most recent content)
  window.scrollTo(0, document.body.scrollHeight);
}

// ---------- Helpers ----------
function findWeek(weekStartDate) {
  return state.weeks.find((w) => w.weekStartDate === weekStartDate);
}

// ---------- Events ----------
function attachEvents() {
  document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const weekStartDate = e.target.dataset.week;
      const dayIndex = parseInt(e.target.dataset.day, 10);
      handleDayEdit(weekStartDate, dayIndex);
    });
  });

  document.querySelectorAll('[data-action="edit-target"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      handleTargetEdit(e.target.dataset.week);
    });
  });

  const addPastBtn = document.querySelector('[data-action="add-past-week"]');
  if (addPastBtn) addPastBtn.addEventListener("click", handleAddPastWeek);
}

function handleDayEdit(weekStartDate, dayIndex) {
  const week = findWeek(weekStartDate);
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

function handleTargetEdit(weekStartDate) {
  const week = findWeek(weekStartDate);
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

// Adds a fully past week for record-keeping. All 7 days can be filled
// in freely, in any order, with a flat allocation (no redistribution).
function handleAddPastWeek() {
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

  if (findWeek(newWeek.weekStartDate)) {
    alert("A week starting on this Sunday already exists.");
    return;
  }

  state.weeks.push(newWeek);
  Storage.save(state);
  render();
}

init();
