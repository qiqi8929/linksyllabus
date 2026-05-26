"use client";

import { useEffect, useState } from "react";

type Item = { key: string; label: string; completed: boolean };

export function PeriodChecklistCard({ period }: { period: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/magiclog/period-checklist?period=${period}`)
      .then((r) => r.json())
      .then((j) => {
        setItems(j.items ?? []);
        if (j.persisted === false) {
          setNotice("Checklist is saved locally for this session until database migration is applied.");
        }
      })
      .finally(() => setLoading(false));
  }, [period]);

  async function toggle(key: string, completed: boolean) {
    const next = items.map((i) => (i.key === key ? { ...i, completed } : i));
    setItems(next);
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/magiclog/period-checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, items: next })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Could not save checklist");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <section className="ml-checklist-card">
      <h2 className="ml-checklist-title">Period {period} checklist</h2>
      <p className="ml-checklist-sub">Track exam, attendance, and sponsor review for this period.</p>
      <ul className="ml-checklist-list">
        {items.map((item) => (
          <li key={item.key}>
            <label className="ml-checklist-item">
              <input
                type="checkbox"
                checked={item.completed}
                disabled={saving}
                onChange={(e) => void toggle(item.key, e.target.checked)}
              />
              <span>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {notice ? <p className="ml-checklist-notice">{notice}</p> : null}
    </section>
  );
}
