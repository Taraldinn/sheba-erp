"use client";

import { useTransition } from "react";

import { logout } from "@/lib/auth";

export function useLogout() {
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
