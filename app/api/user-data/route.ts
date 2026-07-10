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
  // .lean() skips hydrating a full Mongoose document — this doc can be
  // multiple MB (habits + todos + diary + notes + tradeData), so plain
  // objects cut both CPU and memory on every page load.
  let userData = await UserDataModel.findOne({ userId: session.user.id }).lean();

  if (!userData) {
    const created = await UserDataModel.create({
      userId: session.user.id,
      habitData: { habits: [], logs: [] },
      todoData: { todos: [], tags: [] },
      tradeData: { 
        trades: [], 
        customStrategies: [],
        tradeNotes: {
          notes: [],
          categories: []
        }
      },
      diaryData: { entries: [] },
      notesData: { notes: [] },
                  preferences: { accentColor: "#10b981", defaultPage: "/dashboard", defaultTab: "todos", sectionOrder: ["todos", "habits", "diary", "notes"] },      scoreWeights: { habitWeight: 0.5, todoWeight: 0.5 },
      theme: "dark",
    });
    userData = created.toObject();
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
  const allowedFields = ["habitData", "todoData", "tradeData", "diaryData", "notesData", "preferences", "scoreWeights", "theme", "tradingProfiles", "activeProfileId"];
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
