import Link from "next/link";
import ButtonAccount from "@/components/ButtonAccount";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen p-8 pb-24">
      <section className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] opacity-60">Account</p>
            <h1 className="text-3xl font-extrabold md:text-4xl">
              Hello, {session?.user?.name || "there"}
            </h1>
          </div>
          <ButtonAccount />
        </div>

        <div className="rounded-3xl bg-base-100 p-6 shadow-md">
          <h2 className="text-xl font-bold">Your access</h2>
          <p className="mt-2 text-sm opacity-80">
            This account is used for Good Gut Hut admin access and order operations.
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="opacity-70">Signed in as</dt>
              <dd className="font-medium">{session?.user?.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="opacity-70">Role</dt>
              <dd className="font-medium">
                {session?.user?.isAdmin ? "Admin" : "Authenticated account"}
              </dd>
            </div>
          </dl>

          {session?.user?.isAdmin && (
            <div className="mt-6">
              <Link className="btn btn-primary" href="/admin">
                Open admin console
              </Link>
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-base-100 p-6 shadow-md">
          <h2 className="text-xl font-bold">Need help?</h2>
          <p className="mt-2 text-sm opacity-80">
            If you need support with a preorder or account access, contact the team from the site
            footer or email hello@goodguthut.com.
          </p>
        </div>
      </section>
    </main>
  );
}
