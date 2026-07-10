import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { UserDataModel } from "@/lib/models/UserData";

// Server-side redirect: resolves the user's preferred landing page with one
// tiny projected query instead of shipping a client bundle that waits for the
// full /api/user-data payload before navigating.
export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  let dest = "/dashboard";
  try {
    await dbConnect();
    const doc = await UserDataModel.findOne(
      { userId: session.user.id },
      "preferences.defaultPage"
    ).lean<{ preferences?: { defaultPage?: string } }>();
    const preferred = doc?.preferences?.defaultPage;
    if (
      preferred &&
      preferred !== "/" &&
      preferred !== "/productivity" &&
      preferred !== "/trade/trades" &&
      preferred !== "/trades"
    ) {
      dest = preferred;
    }
  } catch {
    // Non-fatal — fall through to the dashboard.
  }

  redirect(dest);
}
