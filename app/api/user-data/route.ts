import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { UserDataModel } from "@/lib/models/UserData";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  let userData = await UserDataModel.findOne({ userId: session.user.id });
  
  if (!userData) {
    userData = await UserDataModel.create({
      userId: session.user.id,
      habitData: { habits: [], logs: [] },
      todoData: { todos: [], tags: [] },
      tradeData: { trades: [], customStrategies: [] },
      diaryData: { entries: [] },
      notesData: { notes: [] },
      preferences: { accentColor: "#6366f1", defaultPage: "/productivity", defaultTab: "todos", sectionOrder: ["todos", "habits", "diary", "notes"] },
      scoreWeights: { habitWeight: 0.5, todoWeight: 0.5 },
      theme: "dark",
    });
  }

  return NextResponse.json(userData);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const body = await req.json();

  // Only allow updating specific fields
  const allowedFields = ["habitData", "todoData", "tradeData", "diaryData", "notesData", "preferences", "scoreWeights", "theme"];
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  const userData = await UserDataModel.findOneAndUpdate(
    { userId: session.user.id },
    { $set: updateData },
    { new: true, upsert: true }
  );

  return NextResponse.json(userData);
}
