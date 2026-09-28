import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeletons con la MISMA geometría que el contenido real. Un skeleton de
 * alturas distintas al contenido produce un salto de layout al hidratar, que
 * es más molesto que la carga en sí.
 */
export function SummaryHeaderSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} className="gap-0 border-slate-200 py-5 shadow-sm">
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-12" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ReviewListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="gap-0 border-slate-200 py-5 shadow-sm">
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-6 w-20 rounded-lg" />
            </div>
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-9 w-64" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
