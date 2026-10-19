/** The ‹ title › bar above the calendar's week and month views. */
export default function PeriodNav({
  title,
  unit,
  isCurrent,
  onPrev,
  onNext,
  onToday,
}: {
  title: string;
  /** "week" or "month": names the buttons ("previous week", "This week", …). */
  unit: string;
  isCurrent: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const arrow = "h-11 w-11 shrink-0 rounded-xl bg-slate-100 text-lg dark:bg-slate-800";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onPrev} className={arrow} aria-label={`previous ${unit}`}>
        ‹
      </button>
      <div className="flex flex-1 flex-col items-center">
        <span className="text-[15px] font-semibold">{title}</span>
        {isCurrent ? (
          <span className="text-[11px] text-slate-500 dark:text-slate-400">This {unit}</span>
        ) : (
          <button type="button" onClick={onToday} className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
            Back to this {unit}
          </button>
        )}
      </div>
      <button type="button" onClick={onNext} className={arrow} aria-label={`next ${unit}`}>
        ›
      </button>
    </div>
  );
}
