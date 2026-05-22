"use client";

export default function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-qld-dark"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="m14 14 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search projects…"
        className="w-72 rounded-md border border-qld-light bg-qld-white py-2 pl-9 pr-3 text-sm text-qld-darkest shadow-card outline-none placeholder:text-qld-dark focus:border-qld-blue focus:ring-2 focus:ring-qld-blue/30"
      />
    </div>
  );
}
