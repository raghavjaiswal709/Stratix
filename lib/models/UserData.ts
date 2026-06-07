import mongoose, { Schema, Document } from "mongoose";
import type { HabitData, TodoData, TradeData, ScoreWeights, DiaryData, NotesData, UserPreferences, TradingProfile } from "@/types";

export interface IUserData extends Document {
  userId: string;
  habitData: HabitData;
  todoData: TodoData;
  tradeData: TradeData;
  diaryData: DiaryData;
  notesData: NotesData;
  preferences: UserPreferences;
  scoreWeights: ScoreWeights;
  theme: "light" | "dark";
  tradingProfiles?: TradingProfile[];
  activeProfileId?: string;
  updatedAt: Date;
}

const UserDataSchema = new Schema<IUserData>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    habitData: {
      type: Schema.Types.Mixed,
      default: { habits: [], logs: [] },
    },
    todoData: {
      type: Schema.Types.Mixed,
      default: { todos: [], tags: [] },
    },
    tradeData: {
      type: Schema.Types.Mixed,
      default: { 
        trades: [], 
        customStrategies: [],
        tradeNotes: {
          notes: [],
          categories: []
        }
      },
    },
    diaryData: {
      type: Schema.Types.Mixed,
      default: { entries: [] },
    },
    notesData: {
      type: Schema.Types.Mixed,
      default: { notes: [] },
    },
    preferences: {
      type: Schema.Types.Mixed,
      default: { accentColor: "#6366f1", defaultPage: "/dashboard", defaultTab: "todos", sectionOrder: ["todos", "habits", "diary", "notes"] },
    },
    scoreWeights: {
      type: Schema.Types.Mixed,
      default: { habitWeight: 0.5, todoWeight: 0.5 },
    },
    theme: { type: String, default: "dark" },
    tradingProfiles: { type: Schema.Types.Mixed, default: [] },
    activeProfileId: { type: String, default: "" },
  },
  { timestamps: true }
);

export const UserDataModel =
  mongoose.models.UserData || mongoose.model<IUserData>("UserData", UserDataSchema);
