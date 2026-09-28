"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logout } from "@/lib/auth";

export function useLogout() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const handleLogout = () => {
    startTransition(async () => {
      try {
        await logout();
      } finally {
        window.location.href = "/login";
      }
    });
  };
  return { handleLogout, isPending };
}
