import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb-client";
import dbConnect from "@/lib/mongodb";
import { UserDataModel } from "@/lib/models/UserData";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users/[userId]/meta
 * Bootstrap data for the admin "view as" page — the target member's name,
 * preferences, trading profiles and active profile, so /admin/view/[userId]
 * can render the Dashboard/Trades pages exactly as that member sees them.
 * Restricted to admin role only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  if (!ObjectId.isValid(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId) },
    { projection: { name: 1, email: 1, image: 1 } }
  );
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await dbConnect();
  const userData = await UserDataModel.findOne(
    { userId },
    "preferences scoreWeights theme tradingProfiles activeProfileId"
  ).lean();

  return NextResponse.json({
    user: {
      id: userId,
      name: user.name ?? "",
      email: user.email ?? "",
      image: user.image ?? "",
    },
    preferences: userData?.preferences ?? null,
    scoreWeights: userData?.scoreWeights ?? null,
    theme: userData?.theme ?? null,
    tradingProfiles: Array.isArray(userData?.tradingProfiles) ? userData.tradingProfiles : [],
    activeProfileId: userData?.activeProfileId ?? "",
  });
}
