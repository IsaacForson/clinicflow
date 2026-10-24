"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the server-rendered display every `seconds` (TV screens stay current without a reload). */
export function Refresher({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
