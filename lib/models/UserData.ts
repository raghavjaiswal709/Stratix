import mongoose, { Schema, Document } from "mongoose";
import type { HabitData, TodoData, TradeData, ScoreWeights, DiaryData } from "@/types";

export interface IUserData extends Document {
  userId: string;
  habitData: HabitData;
  todoData: TodoData;
  tradeData: TradeData;
  diaryData: DiaryData;
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
      default: { todos: [] },
    },
    tradeData: {
      type: Schema.Types.Mixed,
      default: { trades: [], customStrategies: [] },
    },
    diaryData: {
      type: Schema.Types.Mixed,
      default: { entries: [] },
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
