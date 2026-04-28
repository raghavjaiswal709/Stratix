import mongoose, { Schema, Document } from "mongoose";
import type { HabitData, TodoData, TradeData, ScoreWeights, DiaryData, NotesData, UserPreferences } from "@/types";

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
          categories: [
            { id: "1", name: "Strategy", color: "#3b82f6", icon: "Target" },
            { id: "2", name: "Losses", color: "#ef4444", icon: "TrendingDown" },
            { id: "3", name: "Psychology", color: "#8b5cf6", icon: "Brain" },
            { id: "4", name: "Mistakes", color: "#f59e0b", icon: "AlertTriangle" },
          ]
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
  },
  { timestamps: true }
);

export const UserDataModel =
  mongoose.models.UserData || mongoose.model<IUserData>("UserData", UserDataSchema);
