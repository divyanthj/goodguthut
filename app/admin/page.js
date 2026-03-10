import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import PreorderWindow from "@/models/PreorderWindow";
import { createDefaultPreorderWindow } from "@/libs/preorder-catalog";
import AdminLoginButton from "@/components/AdminLoginButton";
import AdminPreorderConsole from "@/components/AdminPreorderConsole";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to access the admin area.</p>
              <AdminLoginButton />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!isAdminEmail(session.user.email)) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-4">
              <h1 className="card-title text-3xl">Admin access denied</h1>
              <p>You are signed in as {session.user.email}.</p>
              <p className="text-error">No, you&apos;re not an admin.</p>
              <p className="opacity-70">Add this email address to the <code>ADMINS</code> env variable to grant access.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  await connectMongo();
  const preorderWindow = await PreorderWindow.findOne({
    status: { $in: ["draft", "open", "closed"] },
  }).sort({ updatedAt: -1, createdAt: -1 });

  const initialWindow = preorderWindow
    ? JSON.parse(JSON.stringify(preorderWindow))
    : createDefaultPreorderWindow();

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Admin preorder control</h1>
          <p className="mt-2 max-w-3xl opacity-75">
            Manage the active preorder window, set per-SKU pricing, and prepare the catalog for Razorpay checkout.
          </p>
        </div>

        <AdminPreorderConsole initialWindow={initialWindow} adminEmail={session.user.email} />
      </div>
    </main>
  );
}
