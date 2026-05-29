"use client";

import { useState, useEffect, useCallback } from "react";
import type { Route } from "~/app/map/transit-data";
import type { PlanSession, PlanSessionSummary } from "~/lib/plans";
import { SavePlanModal } from "./SavePlanModal";

type PlansPanelProps = {
  open: boolean;
  routes: Route[];
  hiddenRoutes: Set<string>;
  currentPlanId: string | null;
  planIsDirty: boolean;
  authUser: { sub: string; name?: string; email?: string } | null | undefined;
  authLoading: boolean;
  onClose: () => void;
  onPlanLoaded: (routes: Route[], hiddenRoutes: Set<string>, planId: string) => void;
  onCurrentPlanIdChange: (id: string | null) => void;
  onMarkSaved: (savedRoutes: Route[]) => void;
  darkMode: boolean;
};

export function PlansPanel({
  open,
  routes,
  hiddenRoutes,
  currentPlanId,
  planIsDirty,
  authUser,
  authLoading,
  onClose,
  onPlanLoaded,
  onCurrentPlanIdChange,
  onMarkSaved,
}: PlansPanelProps) {
  const [plans, setPlans] = useState<PlanSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveAsNew, setSaveAsNew] = useState(false);

  const fetchPlans = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = (await res.json()) as PlanSessionSummary[];
        setPlans(data);
      }
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (open && authUser) {
      void fetchPlans();
    }
  }, [open, authUser, fetchPlans]);

  async function handleLoad(planId: string) {
    setActionLoading(planId);
    try {
      const res = await fetch(`/api/sessions/${planId}`);
      if (!res.ok) return;
      const plan = (await res.json()) as PlanSession;
      onPlanLoaded(plan.routes, new Set(plan.hiddenRoutes), plan.id);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveInPlace() {
    if (!currentPlanId) {
      setSaveAsNew(false);
      setShowSaveModal(true);
      return;
    }
    setActionLoading("saving");
    try {
      const res = await fetch(`/api/sessions/${currentPlanId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routes, hiddenRoutes: [...hiddenRoutes] }),
      });
      if (res.ok) {
        onMarkSaved(routes);
        await fetchPlans();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConfirmSave(name: string) {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, routes, hiddenRoutes: [...hiddenRoutes] }),
    });
    if (!res.ok) throw new Error("Save failed");
    const created = (await res.json()) as PlanSession;
    onCurrentPlanIdChange(created.id);
    onMarkSaved(routes);
    await fetchPlans();
    setShowSaveModal(false);
  }

  async function handleRenameCommit(planId: string) {
    const trimmed = editingName.trim();
    if (!trimmed) { setEditingId(null); return; }
    setActionLoading(planId);
    try {
      const res = await fetch(`/api/sessions/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        if (planId === currentPlanId) {
          // name changed but routes unchanged — still clean
        }
        await fetchPlans();
      }
    } finally {
      setEditingId(null);
      setActionLoading(null);
    }
  }

  async function handleDelete(planId: string) {
    setActionLoading(planId);
    try {
      const res = await fetch(`/api/sessions/${planId}`, { method: "DELETE" });
      if (res.ok) {
        if (planId === currentPlanId) onCurrentPlanIdChange(null);
        setConfirmDeleteId(null);
        await fetchPlans();
      }
    } finally {
      setActionLoading(null);
    }
  }

  const isSaving = actionLoading === "saving";

  return (
    <>
      <div className="flex h-full w-72 flex-col rounded-xl border border-[#D7D7D7] bg-white shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-4 pb-3 pt-4 dark:border-white/5">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2h10a1 1 0 0 1 1 1v10l-3-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1z"/>
            </svg>
            <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">My Plans</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-white/10 dark:hover:text-stone-300"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>

        {/* Not signed in */}
        {!authLoading && !authUser && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
            <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-stone-300 dark:text-stone-600" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <p className="text-sm text-stone-500 dark:text-stone-400">Sign in to save and load your plans across sessions.</p>
            <a
              href="/auth/login"
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-100"
            >
              Sign in
            </a>
          </div>
        )}

        {/* Auth loading */}
        {authLoading && (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
          </div>
        )}

        {/* Plans list */}
        {!authLoading && authUser && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
              {loading ? (
                <div className="flex flex-col gap-2 py-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-stone-100 dark:bg-white/5" />
                  ))}
                </div>
              ) : plans.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                  <svg viewBox="0 0 24 24" fill="none" className="mb-3 h-8 w-8 text-stone-300 dark:text-stone-600" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                  <p className="text-sm text-stone-400 dark:text-stone-500">No saved plans yet.</p>
                  <p className="mt-1 text-xs text-stone-400 dark:text-stone-600">Save your current plan to get started.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 py-1">
                  {plans.map((plan) => {
                    const isActive = plan.id === currentPlanId;
                    const isEditing = editingId === plan.id;
                    const isConfirmingDelete = confirmDeleteId === plan.id;
                    const isActing = actionLoading === plan.id;

                    return (
                      <div key={plan.id}>
                        <div
                          className={`group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors ${
                            isActive
                              ? "bg-teal-50 dark:bg-teal-500/10"
                              : "hover:bg-stone-50 dark:hover:bg-white/5"
                          }`}
                        >
                          {/* Status dot */}
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                              isActive
                                ? planIsDirty
                                  ? "bg-amber-400"
                                  : "bg-teal-500"
                                : "bg-stone-200 dark:bg-stone-600"
                            }`}
                          />

                          {/* Name / edit input */}
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <input
                                autoFocus
                                className="w-full rounded border border-stone-200 bg-white px-1.5 py-0.5 text-sm text-stone-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-[#28282a] dark:text-white"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={() => void handleRenameCommit(plan.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void handleRenameCommit(plan.id);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                              />
                            ) : (
                              <div>
                                <button
                                  onClick={() => void handleLoad(plan.id)}
                                  disabled={isActing}
                                  className="block max-w-full truncate text-left text-sm font-medium text-stone-700 transition-colors hover:text-teal-600 disabled:opacity-50 dark:text-stone-200 dark:hover:text-teal-400"
                                  title={plan.name}
                                >
                                  {plan.name}
                                </button>
                                <p className="text-xs text-stone-400 dark:text-stone-500">
                                  {plan.routeCount} line{plan.routeCount !== 1 ? "s" : ""}
                                  {isActive && planIsDirty && (
                                    <span className="ml-1.5 text-amber-500">· unsaved changes</span>
                                  )}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Actions (pencil + trash) */}
                          {!isEditing && !isActing && (
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={() => { setEditingId(plan.id); setEditingName(plan.name); }}
                                className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-white/10 dark:hover:text-stone-300"
                                title="Rename"
                              >
                                <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 2l3 3-8 8H3v-3l8-8z"/>
                                </svg>
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(plan.id)}
                                className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                title="Delete"
                              >
                                <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 4h12M6 4V2h4v2M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4"/>
                                </svg>
                              </button>
                            </div>
                          )}

                          {/* Loading spinner */}
                          {isActing && (
                            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
                          )}
                        </div>

                        {/* Delete confirmation */}
                        {isConfirmingDelete && (
                          <div className="mx-2 mb-1 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-500/10">
                            <p className="flex-1 text-xs text-red-600 dark:text-red-400">Delete "{plan.name}"?</p>
                            <button
                              onClick={() => void handleDelete(plan.id)}
                              className="rounded px-2 py-0.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-500/20"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded px-2 py-0.5 text-xs text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/10"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-stone-100 px-4 py-3 dark:border-white/5">
              <div className="flex gap-2">
                <button
                  onClick={() => void handleSaveInPlace()}
                  disabled={isSaving}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all disabled:opacity-50 ${
                    planIsDirty && currentPlanId
                      ? "bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400"
                      : "bg-stone-900 text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-100"
                  }`}
                >
                  {isSaving ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 11v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2M8 2v8M5 7l3 3 3-3"/>
                      </svg>
                      Save
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setSaveAsNew(true); setShowSaveModal(true); }}
                  className="flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-50 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5"
                  title="Save as new plan"
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v10M3 8h10"/>
                  </svg>
                  New
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save modal */}
      {showSaveModal && (
        <SavePlanModal
          initialName={saveAsNew ? "" : (plans.find((p) => p.id === currentPlanId)?.name ?? "")}
          onConfirm={handleConfirmSave}
          onClose={() => { setShowSaveModal(false); setSaveAsNew(false); }}
        />
      )}
    </>
  );
}
