"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCompact } from "@/lib/format";
import { API_BASE, getSa2, getSa2Projects, type Sa2Project, type Sa2Summary } from "@/lib/api";

function Sa2View() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const [summary, setSummary] = useState<Sa2Summary | null>(null);
  const [projects, setProjects] = useState<Sa2Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!code) return;
    if (!API_BASE) {
      setError("Set NEXT_PUBLIC_API_URL to load SA2 data from the API.");
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([getSa2(code), getSa2Projects(code)])
      .then(([s, p]) => {
        setSummary(s);
        setProjects(p);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [code]);

  if (!code) return <Notice>Provide an SA2 code: <code>/sa2?code=…</code></Notice>;
  if (error) return <Notice>{error}</Notice>;
  if (loading || !summary) return <Notice>Loading SA2 {code}…</Notice>;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-slate-100">
      <a href="/" className="text-sm text-sky-400 hover:underline">← Map</a>
      <h1 className="mt-2 text-2xl font-semibold">{summary.sa2_name ?? summary.sa2_code}</h1>
      <p className="text-sm text-slate-400">
        {summary.sa4_name} · SA2 {summary.sa2_code} · {summary.financial_year}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Projects" value={String(summary.project_count)} />
        <Card label="Total funding" value={formatCompact(summary.total_funding_aud)} />
        <Card label="Population" value={summary.population ? summary.population.toLocaleString() : "—"} />
        <Card label="SEIFA decile" value={summary.irsd_decile ? String(summary.irsd_decile) : "—"} />
      </div>

      {summary.dominant_agency && (
        <p className="mt-4 text-sm text-slate-300">
          Dominant portfolio: <span className="font-medium">{summary.dominant_agency}</span>
        </p>
      )}

      <h2 className="mt-8 text-lg font-semibold">Projects ({projects.length})</h2>
      <ul className="mt-3 divide-y divide-slate-800 rounded-md border border-slate-800">
        {projects.map((p) => (
          <li key={p.project_id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <div className="text-sm font-medium">{p.name ?? "Unnamed project"}</div>
              <div className="text-xs text-slate-400">{p.agency_name} · {p.type_name}</div>
            </div>
            <div className="tabnum shrink-0 text-sm text-slate-200">
              {formatCompact(p.total_funding_aud)}
            </div>
          </li>
        ))}
        {projects.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-400">No mapped projects in this SA2.</li>
        )}
      </ul>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="tabnum mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-slate-300">
      <a href="/" className="text-sm text-sky-400 hover:underline">← Map</a>
      <p className="mt-4">{children}</p>
    </main>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Suspense fallback={<Notice>Loading…</Notice>}>
        <Sa2View />
      </Suspense>
    </div>
  );
}
