import { redirect } from "next/navigation";
import { currentPrincipal } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await currentPrincipal()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-10" />
          <h1 className="text-xl font-semibold">Sign in to Berth</h1>
          <p className="text-sm text-muted-foreground">
            Use your registry credentials for <span className="font-mono">{env.registryPublicHost}</span>
          </p>
        </div>
        <LoginForm next={typeof next === "string" ? next : "/"} />
      </div>
    </div>
  );
}
