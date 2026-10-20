import { headers } from "next/headers";
import LoginClient from "./LoginClient";
import { obterBrandingPorHost } from "@/lib/white-label/branding";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host");
  const branding = await obterBrandingPorHost(host);

  return <LoginClient branding={branding} />;
}
