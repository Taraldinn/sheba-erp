import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_STORAGE_KEY, serverMe } from "@/lib/api";

const SESSION_COOKIE_NAME = "sheba_session";

export default async function Home() {
  if (process.env.NODE_ENV !== "production") {
    redirect("/overview");
  }
  const store = await cookies();
  const token =
    store.get(SESSION_COOKIE_NAME)?.value ??
    store.get(SESSION_STORAGE_KEY)?.value ??
    null;
  const user = await serverMe(token);
  if (user) redirect("/overview");
  redirect("/login");
}
