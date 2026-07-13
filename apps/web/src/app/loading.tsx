export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="h-7 w-40 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}
