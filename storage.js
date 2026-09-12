// storage.js
// -----------------------------------------------------------------------
// كل شي يخص تخزين البيانات وحساب توزيع السعرات (allocation) موجود هنا.
// الفكرة: نخزن مصفوفة "weeks"، كل أسبوع فيه 7 أيام. الأسبوع الأخير بالمصفوفة
// هو الأسبوع النشط (اللي نسجل فيه حاليًا).
// -----------------------------------------------------------------------

const STORAGE_KEY = "calorieLedgerState";
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const Storage = {
  // يرجع الحالة كاملة، أو null إذا ما فيه بيانات محفوظة بعد
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error("تعذّر قراءة البيانات المحفوظة:", e);
      return null;
    }
  },

  save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  // يرجع تاريخ أقرب أحد (يساوي اليوم لو اليوم نفسه أحد)
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

  // ينشئ أسبوع جديد فاضي بناء على الهدف اليومي
  createWeek(dailyTarget, startDate = new Date()) {
    const sunday = this.getMostRecentSunday(startDate);
    return {
      weekStartDate: this.formatDate(sunday),
      dailyTarget: dailyTarget,
      currentDayIndex: 0,
      days: DAY_NAMES.map((name) => ({
        name,
        allocated: dailyTarget,
        consumed: null, // null = لسا ما انسجل (يطلع "–")
        locked: false,
      })),
    };
  },

  // ------------------------------------------------------------------
  // القاعدة الموحدة لإعادة توزيع السعرات على الأيام المفتوحة
  // remainingBudget = (dailyTarget × 7) − مجموع consumed للأيام المقفولة
  // newAllocated لكل يوم مفتوح = remainingBudget ÷ عدد الأيام المفتوحة
  // ------------------------------------------------------------------
  recalcAllocation(week) {
    const weeklyBudget = week.dailyTarget * 7;
    const lockedConsumedSum = week.days
      .filter((d) => d.locked)
      .reduce((sum, d) => sum + (d.consumed || 0), 0);

    const openDays = week.days.filter((d) => !d.locked);
    if (openDays.length === 0) return; // الأسبوع خلص بالكامل

    const remainingBudget = weeklyBudget - lockedConsumedSum;
    const newAllocated = Math.round(remainingBudget / openDays.length);

    openDays.forEach((d) => {
      d.allocated = newAllocated;
    });
  },

  // تحديث سعرات اليوم النشط (قبل القفل) — يعيد التوزيع على الأيام الجاية لحظيًا
  updateActiveDayConsumed(week, value) {
    const day = week.days[week.currentDayIndex];
    day.consumed = value;
    this.recalcAllocation(week);
  },

  // قفل اليوم الحالي وينقل المؤشر لليوم اللي بعده
  lockCurrentDay(week) {
    const day = week.days[week.currentDayIndex];
    if (day.consumed === null) day.consumed = 0;
    day.locked = true;

    if (week.currentDayIndex < 6) {
      week.currentDayIndex += 1;
    }
    this.recalcAllocation(week);
  },

  // تعديل يوم قديم (مقفول) من الهيستوري — يعيد التوزيع للأيام المفتوحة بعده فقط
  editHistoricalDay(week, dayIndex, newValue) {
    week.days[dayIndex].consumed = newValue;
    this.recalcAllocation(week);
  },

  // مجموع المستهدف والفعلي لأسبوع كامل (يشمل اليوم النشط بقيمته الحالية)
  getWeekTotals(week) {
    const totalTarget = week.dailyTarget * 7;
    const totalActual = week.days.reduce((sum, d) => sum + (d.consumed || 0), 0);
    return { totalTarget, totalActual, diff: totalActual - totalTarget };
  },

  // هل فات منتصف الليل على اليوم النشط؟ (نقارن تاريخ اليوم الحالي الفعلي
  // بتاريخ بداية الأسبوع + عدد الأيام المقفولة)
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
