import {
  ReviewListSkeleton,
  SummaryHeaderSkeleton,
} from "@/components/LoadingSkeletons";

/**
 * Estado de carga con la misma geometría que el contenido real, para que no
 * haya salto de layout al hidratar.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <div className="h-7 w-56 animate-pulse rounded-md bg-slate-200" />
        <div className="h-4 w-36 animate-pulse rounded-md bg-slate-200" />
      </header>

      <SummaryHeaderSkeleton />
      <div className="h-[86px] animate-pulse rounded-xl border border-slate-200 bg-white" />
      <ReviewListSkeleton />
    </main>
  );
}
