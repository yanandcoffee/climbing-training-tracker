import { useState } from "react";
import { format } from "date-fns";
import { parseKey } from "../lib/dates";

export type DayMenuChoice = "move" | "copyTo" | "import" | "copyFrom";

/** The ⋯ menu on a day's workout: the less frequent actions, in one sheet. */
export default function DayMenuSheet({
  date,
  name,
  canCopyFrom,
  onPick,
  onClear,
  onClose,
}: {
  date: string;
  name?: string;
  canCopyFrom: boolean;
  onPick: (choice: DayMenuChoice) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const day = format(parseKey(date), "EEE d MMM");

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Workout actions"
        className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] dark:bg-slate-900 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <p className="min-w-0 truncate text-sm font-semibold">
            {name || "Workout"} · {day}
          </p>
          <button type="button" onClick={onClose} className="text-sm text-slate-400">
            Close
          </button>
        </div>

        <Group title="This workout">
          <Row icon="📅" label="Move to another day" hint="Swap or combine if that day has one" onClick={() => onPick("move")} />
          <Row icon="⧉" label="Copy to other days" hint="Repeat it on the days you pick" onClick={() => onPick("copyTo")} />
        </Group>

        <Group title="Add to it">
          <Row icon="📋" label="Import a coach's note" hint="Paste a note; its exercises join this day" onClick={() => onPick("import")} />
          <Row
            icon="⧉"
            label="Copy in a previous workout"
            hint="Add or replace with another day's exercises"
            disabled={!canCopyFrom}
            onClick={() => onPick("copyFrom")}
          />
        </Group>

        {confirmClear ? (
          <div className="rounded-xl bg-red-50 p-3 text-sm dark:bg-red-950/40">
            <p className="mb-2">Remove everything on {day}? You can undo it.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClear}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 font-medium text-white"
              >
                Yes, clear day
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="flex-1 rounded-lg bg-slate-100 px-3 py-2 font-medium dark:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Clear this day
          </button>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-slate-50 dark:divide-slate-800 dark:bg-slate-800/50">
        {children}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-40"
    >
      <span className="w-5 shrink-0 text-center" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );
}
