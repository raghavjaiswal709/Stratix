// Root-level route transition fallback — shown while any page's chunk or
// server payload is in flight, so navigation never leaves a blank screen.
export default function RootLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
    </div>
  );
}
