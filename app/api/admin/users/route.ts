import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb-client";
import { UserDataModel } from "@/lib/models/UserData";
import dbConnect from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 * Returns all users with their associated userData.
 * Restricted to admin role only — 403 for everyone else.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await clientPromise;
  const db = client.db();

  const [users, userdatas, tradeentries, mt5configs, accounts] = await Promise.all([
    db
      .collection("users")
      .find({}, { projection: { name: 1, email: 1, image: 1, role: 1, emailVerified: 1 } })
      .toArray(),
    db.collection("userdatas").find({}).toArray(),
    db.collection("tradeentries").find({}).toArray(),
    db.collection("mt5configs").find({}).toArray(),
    db.collection("accounts").find({}).toArray(),
  ]);

  // Index side-collections by userId (stored as string or ObjectId)
  const userDataMap = new Map<string, unknown>();
  for (const ud of userdatas) {
    userDataMap.set(String(ud.userId), ud);
  }

  const tradeMap = new Map<string, unknown[]>();
  for (const t of tradeentries) {
    const uid = String(t.userId);
    if (!tradeMap.has(uid)) tradeMap.set(uid, []);
    tradeMap.get(uid)!.push(t);
  }

  const mt5Map = new Map<string, unknown[]>();
  for (const m of mt5configs) {
    const uid = String(m.userId);
    if (!mt5Map.has(uid)) mt5Map.set(uid, []);
    mt5Map.get(uid)!.push(m);
  }

  // Build enriched user list
  const enriched = users.map((u) => {
    const uid = String(u._id);
    return {
      _id: uid,
      name: u.name,
      email: u.email,
      image: u.image,
      role: u.role ?? "user",
      emailVerified: u.emailVerified,
      userData: userDataMap.get(uid) ?? null,
      tradeEntries: tradeMap.get(uid) ?? [],
      mt5Configs: mt5Map.get(uid) ?? [],
    };
  });

  return NextResponse.json({ users: enriched, accounts });
}

/**
 * PUT /api/admin/users
 * Updates preferences and theme settings for a specific user.
 * Restricted to admin role only — 403 for everyone else.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();
  const body = await req.json();
  const { userId, preferences, theme, role } = body;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const updateData: Record<string, any> = {};
  if (preferences !== undefined) updateData.preferences = preferences;
  if (theme !== undefined) updateData.theme = theme;

  const userData = await UserDataModel.findOneAndUpdate(
    { userId },
    { $set: updateData },
    { new: true, upsert: true }
  );

  if (role !== undefined && ObjectId.isValid(userId)) {
    const client = await clientPromise;
    const db = client.db();
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: { role } }
    );
  }

  return NextResponse.json({ success: true, userData });
}
