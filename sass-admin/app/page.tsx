"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/lib/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      router.replace("/overview");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center bg-background text-muted">
      <p className="text-sm font-mono">Redirecting...</p>
    </div>
  );
}
