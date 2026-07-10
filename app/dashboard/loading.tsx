// Instant skeleton while the dashboard route chunk loads — the page paints
// something meaningful on the first frame instead of a blank screen.
export default function DashboardLoading() {
  return (
    <div className="flex-1 space-y-6 p-4 md:p-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 w-40 rounded-md bg-white/[0.06]" />
        <div className="h-4 w-56 rounded-md bg-white/[0.04]" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-white/[0.06] bg-white/[0.03]" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-72 rounded-xl border border-white/[0.06] bg-white/[0.03]" />
        <div className="h-72 rounded-xl border border-white/[0.06] bg-white/[0.03]" />
      </div>
      <div className="h-56 rounded-xl border border-white/[0.06] bg-white/[0.03]" />
    </div>
  );
}
