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

/**
 * Returns the title of the first trade note whose content still carries an
 * inline base64 image, or null when the payload is clean.
 */
function findInlineNoteImage(tradeData: unknown): string | null {
  const notes = (tradeData as { tradeNotes?: { notes?: unknown } } | undefined)?.tradeNotes?.notes;
  if (!Array.isArray(notes)) return null;
  for (const note of notes) {
    const { content, title } = (note ?? {}) as { content?: unknown; title?: unknown };
    if (typeof content === "string" && content.includes("data:image/")) {
      return typeof title === "string" && title.trim() ? title : "Untitled";
    }
  }
  return null;
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

  // Guard against the regression that made this route unusable: note images
  // embedded as base64 data URIs. Because this document is read and written
  // whole, a single 4 MB note pushed every write past the driver's socket
  // timeout (surfacing as MongoNetworkTimeoutError / RetryableWriteError) and
  // held pool connections long enough to stall unrelated routes. Images now go
  // to R2 via /api/uploads/presign, so a data URI here means a stale client
  // bundle — fail fast and loudly instead of hanging for 90s.
  const inlineImage = findInlineNoteImage(updateData.tradeData);
  if (inlineImage) {
    return NextResponse.json(
      {
        error:
          "Note images must be uploaded to storage, not embedded as base64. " +
          `Note "${inlineImage}" still contains an inline image — reload the page to pick up the latest editor.`,
      },
      { status: 413 }
    );
  }

  const userData = await UserDataModel.findOneAndUpdate(
    { userId: session.user.id },
    { $set: updateData },
    { new: true, upsert: true }
  );

  return NextResponse.json(userData);
}
