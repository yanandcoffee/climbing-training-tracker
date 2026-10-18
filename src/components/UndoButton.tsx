import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useStore } from "../store/useStore";

// The brief message above the tab bar ("Marked Repeaters Done · Undo").
const useToast = create<{ message: string | null; show: (text: string, ms: number) => void }>((set) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    message: null,
    show: (text, ms) => {
      clearTimeout(timer);
      set({ message: text });
      timer = setTimeout(() => set({ message: null }), ms);
    },
  };
});

/** The latest undoable change, and a function that undoes it (and says so). */
export function useUndo() {
  const top = useStore((s) => s.undoStack[s.undoStack.length - 1]);
  const doUndo = () => {
    const step = useStore.getState().undoStack.at(-1);
    if (!step) return;
    useStore.getState().undo();
    useToast.getState().show(`Undid: ${step.label}`, 2500);
  };
  return { top, doUndo };
}

/**
 * A small "↶ Undo" button that lives in a screen's own toolbar.
 * `compact` shows just the arrow, and only while there's something to undo.
 */
export function UndoInlineButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { top, doUndo } = useUndo();
  if (compact && !top) return null;
  return (
    <button
      type="button"
      onClick={doUndo}
      disabled={!top}
      aria-label={top ? `Undo ${top.label}` : "Nothing to undo"}
      title={top ? `Undo: ${top.label}` : "Nothing to undo"}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${className}`}
    >
      {compact ? "↶" : "↶ Undo"}
    </button>
  );
}

/**
 * After each change, briefly names it above the tab bar with an Undo button,
 * then gets out of the way (the screens keep their own Undo button).
 * Ctrl/⌘+Z works too, outside text fields.
 */
export default function UndoToast() {
  const { top, doUndo } = useUndo();
  const message = useToast((s) => s.message);
  const prevTop = useRef(top);

  // A new change (not an undo uncovering an older one) → name it.
  useEffect(() => {
    const prev = prevTop.current;
    prevTop.current = top;
    if (top && top !== prev && top.id >= (prev?.id ?? 0)) useToast.getState().show(top.label, 6000);
  }, [top]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      doUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!message) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.75rem)" }}
    >
      <div className="mx-auto flex max-w-xl justify-center px-4">
        <div
          role="status"
          className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-slate-900 py-1 pr-1 pl-4 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
        >
          <span className="min-w-0 truncate py-1.5">{message}</span>
          {top && !message.startsWith("Undid:") ? (
            <button
              type="button"
              onClick={doUndo}
              aria-label={`Undo ${top.label}`}
              className="shrink-0 rounded-full px-3 py-1.5 font-medium text-sky-300 dark:text-sky-700"
            >
              Undo
            </button>
          ) : (
            <span className="w-3" />
          )}
        </div>
      </div>
    </div>
  );
}
