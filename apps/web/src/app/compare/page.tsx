"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCompact } from "@/lib/format";
import { API_BASE, getSa2, type Sa2Summary } from "@/lib/api";

function CompareView() {
  const params = useSearchParams();
  const codes = (params.get("codes") ?? "").split(",").map((c) => c.trim()).filter(Boolean).slice(0, 4);
  const [rows, setRows] = useState<Sa2Summary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (codes.length === 0) return;
    if (!API_BASE) {
      setError("Set NEXT_PUBLIC_API_URL to load SA2 data from the API.");
      return;
    }
    Promise.all(codes.map((c) => getSa2(c).catch(() => null)))
      .then((res) => setRows(res.filter((r): r is Sa2Summary => r !== null)))
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("codes")]);

  if (codes.length === 0)
    return <Notice>Provide up to four SA2 codes: <code>/compare?codes=301011001,301011002</code></Notice>;
  if (error) return <Notice>{error}</Notice>;

  const metrics: [string, (r: Sa2Summary) => string][] = [
    ["Projects", (r) => String(r.project_count)],
    ["Total funding", (r) => formatCompact(r.total_funding_aud)],
    ["QLD funding", (r) => formatCompact(r.qld_funding_aud)],
    ["Federal funding", (r) => formatCompact(r.fed_funding_aud)],
    ["Population", (r) => (r.population ? r.population.toLocaleString() : "—")],
    ["SEIFA decile", (r) => (r.irsd_decile ? String(r.irsd_decile) : "—")],
    ["Transit stops (30m)", (r) => String((r as Sa2Summary & { transit_stop_count?: number }).transit_stop_count ?? 0)],
    ["Dominant portfolio", (r) => r.dominant_agency ?? "—"],
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-slate-100">
      <a href="/" className="text-sm text-sky-400 hover:underline">← Map</a>
      <h1 className="mt-2 text-2xl font-semibold">Compare SA2s</h1>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-left">
              <th className="py-2 pr-4 font-medium text-slate-400">Metric</th>
              {rows.map((r) => (
                <th key={r.sa2_code} className="px-4 py-2 font-semibold">{r.sa2_name ?? r.sa2_code}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(([label, fn]) => (
              <tr key={label} className="border-b border-slate-800">
                <td className="py-2 pr-4 text-slate-400">{label}</td>
                {rows.map((r) => (
                  <td key={r.sa2_code} className="tabnum px-4 py-2">{fn(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-slate-300">
      <a href="/" className="text-sm text-sky-400 hover:underline">← Map</a>
      <p className="mt-4">{children}</p>
    </main>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Suspense fallback={<Notice>Loading…</Notice>}>
        <CompareView />
      </Suspense>
    </div>
  );
}
