"use client";

import { useState } from "react";

export function SavePlanModal({
  initialName = "",
  onConfirm,
  onClose,
}: {
  initialName?: string;
  onConfirm: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = name.trim().length > 0 && !saving;

  async function handleConfirm() {
    if (!canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(name.trim());
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-72 rounded-2xl border border-[#D7D7D7] bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1c1c1e]">
        <h3 className="mb-4 text-base font-semibold text-stone-800 dark:text-stone-100">
          Save Plan
        </h3>

        <input
          autoFocus
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none placeholder-stone-400 transition-colors focus:border-stone-400 dark:border-white/10 dark:bg-[#28282a] dark:text-white dark:placeholder-stone-500 dark:focus:border-stone-500"
          placeholder="Plan name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleConfirm();
            if (e.key === "Escape") onClose();
          }}
        />

        {error && (
          <p className="mt-2 text-xs text-red-500">{error}</p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-stone-200 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-50 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            className="flex-1 rounded-lg bg-stone-900 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-40 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-100"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
