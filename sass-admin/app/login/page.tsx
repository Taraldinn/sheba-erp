import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginCard } from "@/components/login-card";
import { SESSION_COOKIE_NAME, SESSION_STORAGE_KEY, serverMe } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(SESSION_COOKIE_NAME)?.value ??
    cookieStore.get(SESSION_STORAGE_KEY)?.value ??
    null;

  if (token) {
    const user = await serverMe(token);

    if (user) redirect("/overview");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <LoginCard />
    </main>
  );
}
