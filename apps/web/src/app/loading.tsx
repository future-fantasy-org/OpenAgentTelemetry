export default function Loading() {
  return (
    <div className="oat-page">
      <div className="mb-6 space-y-2">
        <div className="h-6 w-40 animate-pulse rounded-md bg-slate-200" />
        <div className="h-4 w-64 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="oat-card overflow-hidden">
        <div className="space-y-px">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
