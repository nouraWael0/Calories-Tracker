// app.js
// -----------------------------------------------------------------------
// اللوجيك + الرسم على الشاشة. صفحة وحدة، كل الأسابيع تترسم من الأقدم
// (فوق) للأحدث (تحت)، والأسبوع الأخير بالأسفل هو النشط.
// -----------------------------------------------------------------------

let state = Storage.load();
const root = document.getElementById("app");

// ---------- نقطة البداية ----------
function init() {
  if (!state) {
    renderOnboarding();
    return;
  }

  const activeWeek = state.weeks[state.weeks.length - 1];

  // شيك منتصف الليل: إذا فات، نقفل اليوم تلقائيًا وننتقل لليوم التالي
  while (Storage.isMidnightPassed(activeWeek)) {
    Storage.lockCurrentDay(activeWeek);
  }
  Storage.save(state);

  render();
}

// ---------- شاشة أول استخدام: إدخال الهدف اليومي ----------
function renderOnboarding() {
  root.innerHTML = `
    <div class="onboarding">
      <h1>دفتر السعرات</h1>
      <p>كم هدفك اليومي من السعرات؟</p>
      <input type="number" id="targetInput" placeholder="مثال: 1200" inputmode="numeric" />
      <button id="startBtn">ابدأ</button>
    </div>
  `;
  document.getElementById("startBtn").addEventListener("click", () => {
    const val = parseInt(document.getElementById("targetInput").value, 10);
    if (!val || val <= 0) return;
    state = { weeks: [Storage.createWeek(val)] };
    Storage.save(state);
    render();
  });
}

// ---------- منطق الألوان والأسهم ----------
// يرجع { text, colorClass, arrow } حسب حالة اليوم
function getDayVisual(day, isActive) {
  if (day.consumed === null) {
    return { text: "–", colorClass: "muted", arrow: "" };
  }

  const diff = day.consumed - day.allocated;

  if (isActive) {
    // اليوم النشط: نعرض "الباقي" بدل الفرق المباشر
    if (diff === 0) return { text: "✓", colorClass: "neutral", arrow: "" };

    if (diff < 0) {
      const remaining = Math.abs(diff);
      const color = remaining >= 200 ? "green" : "neutral";
      return { text: `متبقي ${fmt(remaining)}`, colorClass: color, arrow: "↓" };
    } else {
      const color = diff >= 200 ? "red" : "neutral";
      return { text: `${fmt(diff)}+`, colorClass: color, arrow: "↑" };
    }
  } else {
    // يوم منتهي / صف الإجمالي
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

// ---------- رسم أسبوع واحد (بلوك) ----------
function renderWeekBlock(week, weekIndex, isCurrentWeek) {
  const { totalTarget, totalActual, diff } = Storage.getWeekTotals(week);

  const rows = week.days
    .map((day, i) => {
      const isActive = isCurrentWeek && i === week.currentDayIndex && !day.locked;
      const visual = getDayVisual(day, isActive);
      const editable = isCurrentWeek && (isActive || day.locked);

      return `
        <div class="day-row ${isActive ? "active" : ""}" data-week="${weekIndex}" data-day="${i}">
          <span class="day-name">${day.name}</span>
          <span class="day-consumed">${day.consumed !== null ? fmt(day.consumed) : "–"}</span>
          <span class="day-diff ${visual.colorClass}">
            ${visual.arrow ? `<span class="arrow ${visual.colorClass}">${visual.arrow}</span>` : ""}
            ${visual.text}
          </span>
          ${editable ? `<button class="edit-btn" data-action="edit" data-week="${weekIndex}" data-day="${i}">${isActive ? "Set" : "✎"}</button>` : ""}
        </div>
      `;
    })
    .join("");

  const totalColor =
    diff === 0 ? "neutral" : Math.abs(diff) < 200 ? "yellow" : diff > 0 ? "red" : "green";
  const totalArrow = diff === 0 ? "" : diff > 0 ? "↑" : "↓";

  return `
    <section class="week-block ${isCurrentWeek ? "current" : "past"}">
      <div class="week-header">
        <span>${week.weekStartDate}</span>
        ${isCurrentWeek ? `<button data-action="edit-target" data-week="${weekIndex}">⚙ هدف: ${fmt(week.dailyTarget)}</button>` : ""}
      </div>
      ${rows}
      <div class="day-row total-row">
        <span class="day-name">الإجمالي</span>
        <span class="day-consumed">${fmt(totalActual)} / ${fmt(totalTarget)}</span>
        <span class="day-diff ${totalColor}">
          ${totalArrow ? `<span class="arrow ${totalColor}">${totalArrow}</span>` : ""}
          ${fmt(Math.abs(diff))}
        </span>
      </div>
    </section>
  `;
}

// ---------- الرسم الكامل ----------
function render() {
  const blocks = state.weeks
    .map((week, i) => renderWeekBlock(week, i, i === state.weeks.length - 1))
    .join("");

  root.innerHTML = `<div class="ledger">${blocks}</div>`;
  attachEvents();

  // نسكرول لآخر الصفحة (أحدث محتوى) تلقائيًا
  window.scrollTo(0, document.body.scrollHeight);
}

// ---------- الأحداث ----------
function attachEvents() {
  document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const weekIndex = parseInt(e.target.dataset.week, 10);
      const dayIndex = parseInt(e.target.dataset.day, 10);
      handleDayEdit(weekIndex, dayIndex);
    });
  });

  document.querySelectorAll('[data-action="edit-target"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const weekIndex = parseInt(e.target.dataset.week, 10);
      handleTargetEdit(weekIndex);
    });
  });
}

function handleDayEdit(weekIndex, dayIndex) {
  const week = state.weeks[weekIndex];
  const day = week.days[dayIndex];
  const isActiveDay = dayIndex === week.currentDayIndex && !day.locked;

  // لو يوم مقفول (هيستوري) نطلب تأكيد قبل التعديل
  if (day.locked) {
    const confirmed = confirm("هذا اليوم مقفول. تبين تعدلين على الهيستوري؟");
    if (!confirmed) return;
  }

  const input = prompt(`سعرات ${day.name}:`, day.consumed ?? "");
  if (input === null) return;
  const value = parseInt(input, 10);
  if (isNaN(value) || value < 0) return;

  if (isActiveDay) {
    Storage.updateActiveDayConsumed(week, value);
    const lockNow = confirm("تم الحفظ. تبين تقفلين اليوم الحين وتنتقلين لليوم اللي بعده؟");
    if (lockNow) Storage.lockCurrentDay(week);
  } else {
    Storage.editHistoricalDay(week, dayIndex, value);
  }

  Storage.save(state);
  render();
}

function handleTargetEdit(weekIndex) {
  const week = state.weeks[weekIndex];
  const input = prompt("الهدف اليومي الجديد:", week.dailyTarget);
  if (input === null) return;
  const value = parseInt(input, 10);
  if (isNaN(value) || value <= 0) return;

  const scope = confirm(
    "اضغطي 'موافق' لتطبيقه على هذا الأسبوع فقط، أو 'إلغاء' لجعله الهدف الافتراضي للأسابيع الجاية بدون تغيير هذا الأسبوع."
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

init();
