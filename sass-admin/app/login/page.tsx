"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginCard } from "@/components/login-card";
import { getStoredToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      router.replace("/overview");
    }
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <LoginCard />
    </main>
  );
}
