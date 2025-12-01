import { useEffect, useState } from "react";

import { formatDate } from "@/lib/admin/ingestion-formatters";

export function ClientSideDate({
  value,
}: {
  value: string | null | undefined;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <span>--</span>;
  }

  return <>{formatDate(value)}</>;
}
