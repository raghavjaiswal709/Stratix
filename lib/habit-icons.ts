import {
  // Fitness
  Dumbbell, Bike, Flame, Activity, Footprints, PersonStanding, Weight, Swords,
  HeartPulse, Timer, Zap, Wind, Sun, Waves,
  // Health
  Heart, Stethoscope, Pill, Droplets, Eye, Brain, Thermometer, TestTube,
  Microscope, Syringe, Dna, FlaskConical,
  // Food
  Apple, Utensils, Coffee, UtensilsCrossed, Pizza, Salad, Egg, Cookie,
  Sandwich, Wine, Milk, Carrot, Wheat, Citrus, IceCreamCone,
  // Sleep
  Moon, Bed, BedDouble, CloudMoon, Sunrise, Sunset,
  // Mind
  Smile, Leaf, Sprout, Gem, Puzzle, Sparkle, HeartHandshake, Flower2, PawPrint, Globe,
  // Finance
  DollarSign, PiggyBank, TrendingUp, TrendingDown, CreditCard, Wallet, Coins,
  ChartBar, ChartLine, Landmark, Briefcase, Receipt,
  // Learning
  BookOpen, GraduationCap, Lightbulb, PenLine, Code, Library, Telescope,
  Feather, Map, Calculator, Languages, BookMarked, NotebookPen,
  // Social
  Users, MessageCircle, Phone, Mail, Video, UserPlus, Share2, Handshake, PartyPopper,
  // Productivity
  Target, Trophy, Star, Rocket, SquareCheck, ClipboardList, Flag, Bell,
  AlarmClock, Gauge, ListTodo, LayoutDashboard, Kanban,
  // Lifestyle
  Music, Camera, Home, ShoppingCart, Smartphone, Gamepad2, Headphones, Tv,
  Car, Plane, Scissors, Brush, Palette, Shirt, Watch, Trees, Mountain,
} from "lucide-react";

// ── Icon component map ────────────────────────────────────────────────────

export const HABIT_ICON_MAP = {
  // Fitness
  Dumbbell, Bike, Flame, Activity, Footprints, PersonStanding, Weight, Swords,
  HeartPulse, Timer, Zap, Wind, Sun, Waves,
  // Health
  Heart, Stethoscope, Pill, Droplets, Eye, Brain, Thermometer, TestTube,
  Microscope, Syringe, Dna, FlaskConical,
  // Food
  Apple, Utensils, Coffee, UtensilsCrossed, Pizza, Salad, Egg, Cookie,
  Sandwich, Wine, Milk, Carrot, Wheat, Citrus, IceCreamCone,
  // Sleep
  Moon, Bed, BedDouble, CloudMoon, Sunrise, Sunset,
  // Mind
  Smile, Leaf, Sprout, Gem, Puzzle, Sparkle, HeartHandshake, Flower2, PawPrint, Globe,
  // Finance
  DollarSign, PiggyBank, TrendingUp, TrendingDown, CreditCard, Wallet, Coins,
  ChartBar, ChartLine, Landmark, Briefcase, Receipt,
  // Learning
  BookOpen, GraduationCap, Lightbulb, PenLine, Code, Library, Telescope,
  Feather, Map, Calculator, Languages, BookMarked, NotebookPen,
  // Social
  Users, MessageCircle, Phone, Mail, Video, UserPlus, Share2, Handshake, PartyPopper,
  // Productivity
  Target, Trophy, Star, Rocket, SquareCheck, ClipboardList, Flag, Bell,
  AlarmClock, Gauge, ListTodo, LayoutDashboard, Kanban,
  // Lifestyle
  Music, Camera, Home, ShoppingCart, Smartphone, Gamepad2, Headphones, Tv,
  Car, Plane, Scissors, Brush, Palette, Shirt, Watch, Trees, Mountain,
} as const;

export type HabitIconKey = keyof typeof HABIT_ICON_MAP;

// ── Metadata ─────────────────────────────────────────────────────────────

export interface IconEntry {
  key: HabitIconKey;
  label: string;
  category: string;
  tags: string[];
}

export const ICON_CATEGORIES = [
  "All",
  "Fitness",
  "Health",
  "Food",
  "Sleep",
  "Mind",
  "Finance",
  "Learning",
  "Social",
  "Productivity",
  "Lifestyle",
] as const;

export type IconCategory = (typeof ICON_CATEGORIES)[number];

export const HABIT_ICONS_LIST: IconEntry[] = [
  // ── Fitness ─────────────────────────────────────────────────────────────
  { key: "Dumbbell",        label: "Weights",     category: "Fitness",      tags: ["gym", "workout", "lift", "strength", "bodybuilding"] },
  { key: "Bike",            label: "Cycling",     category: "Fitness",      tags: ["bicycle", "cardio", "outdoor", "spin"] },
  { key: "Flame",           label: "HIIT",        category: "Fitness",      tags: ["fire", "burn", "intense", "workout"] },
  { key: "Activity",        label: "Active",      category: "Fitness",      tags: ["exercise", "pulse", "heart rate", "movement"] },
  { key: "Footprints",      label: "Walking",     category: "Fitness",      tags: ["steps", "walk", "run", "jog", "10k steps"] },
  { key: "PersonStanding",  label: "Yoga",        category: "Fitness",      tags: ["stretch", "pose", "balance", "flexibility"] },
  { key: "Weight",          label: "Weight",      category: "Fitness",      tags: ["scale", "body weight", "track", "measure"] },
  { key: "Swords",          label: "Combat",      category: "Fitness",      tags: ["martial arts", "fight", "boxing", "sparring"] },
  { key: "HeartPulse",      label: "Cardio",      category: "Fitness",      tags: ["heart rate", "pulse", "aerobic", "endurance"] },
  { key: "Timer",           label: "Timed",       category: "Fitness",      tags: ["stopwatch", "interval", "time", "plank"] },
  { key: "Zap",             label: "Sprint",      category: "Fitness",      tags: ["power", "sprint", "explosive", "fast"] },
  { key: "Wind",            label: "Breathing",   category: "Fitness",      tags: ["breath", "pranayama", "oxygen", "lung"] },
  { key: "Sun",             label: "Morning",     category: "Fitness",      tags: ["sunrise", "morning routine", "workout", "outdoor"] },
  { key: "Waves",           label: "Swimming",    category: "Fitness",      tags: ["swim", "pool", "water", "lap"] },

  // ── Health ───────────────────────────────────────────────────────────────
  { key: "Heart",           label: "Heart",       category: "Health",       tags: ["cardiovascular", "cardio", "health"] },
  { key: "Stethoscope",     label: "Doctor",      category: "Health",       tags: ["medical", "checkup", "appointment"] },
  { key: "Pill",            label: "Medicine",    category: "Health",       tags: ["medication", "supplement", "vitamins", "rx"] },
  { key: "Droplets",        label: "Hydration",   category: "Health",       tags: ["water", "drink", "fluid", "8 glasses"] },
  { key: "Eye",             label: "Vision",      category: "Health",       tags: ["eyes", "sight", "screen time", "care"] },
  { key: "Brain",           label: "Brain",       category: "Health",       tags: ["mental", "cognitive", "focus", "neuroplasticity"] },
  { key: "Thermometer",     label: "Health",      category: "Health",       tags: ["temperature", "fever", "wellness", "check"] },
  { key: "TestTube",        label: "Lab Test",    category: "Health",       tags: ["testing", "analysis", "blood", "results"] },
  { key: "Microscope",      label: "Research",    category: "Health",       tags: ["science", "detail", "analyze", "study"] },
  { key: "Syringe",         label: "Treatment",   category: "Health",       tags: ["injection", "vaccine", "medical", "shot"] },
  { key: "Dna",             label: "Genetics",    category: "Health",       tags: ["dna", "biology", "body", "genes"] },
  { key: "FlaskConical",    label: "Supplements", category: "Health",       tags: ["experiment", "chemistry", "lab", "formula"] },

  // ── Food ─────────────────────────────────────────────────────────────────
  { key: "Apple",           label: "Fruit",       category: "Food",         tags: ["healthy", "diet", "nutrition", "snack"] },
  { key: "Utensils",        label: "Meal Prep",   category: "Food",         tags: ["eat", "food", "cooking", "dinner", "lunch"] },
  { key: "Coffee",          label: "Coffee",      category: "Food",         tags: ["caffeine", "morning", "drink", "espresso"] },
  { key: "UtensilsCrossed", label: "Cooking",     category: "Food",         tags: ["kitchen", "chef", "prepare", "homemade"] },
  { key: "Pizza",           label: "Pizza",       category: "Food",         tags: ["cheat meal", "pizza", "junk food"] },
  { key: "Salad",           label: "Salad",       category: "Food",         tags: ["vegetables", "healthy", "greens", "veggies"] },
  { key: "Egg",             label: "Eggs",        category: "Food",         tags: ["protein", "breakfast", "cook", "omelette"] },
  { key: "Cookie",          label: "Treats",      category: "Food",         tags: ["sweet", "dessert", "baking", "sugar free"] },
  { key: "Sandwich",        label: "Lunch",       category: "Food",         tags: ["meal", "bread", "wrap", "midday"] },
  { key: "Wine",            label: "Alcohol",     category: "Food",         tags: ["drink", "alcohol", "social", "limit"] },
  { key: "Milk",            label: "Dairy",       category: "Food",         tags: ["calcium", "drink", "protein", "dairy free"] },
  { key: "Carrot",          label: "Vegetables",  category: "Food",         tags: ["veggie", "healthy", "orange", "plant"] },
  { key: "Wheat",           label: "Grains",      category: "Food",         tags: ["carbs", "bread", "gluten", "cereal"] },
  { key: "Citrus",          label: "Citrus",      category: "Food",         tags: ["vitamin c", "orange", "lemon", "fruit"] },
  { key: "IceCreamCone",    label: "Dessert",     category: "Food",         tags: ["sweet", "treat", "indulgence", "reward"] },

  // ── Sleep ────────────────────────────────────────────────────────────────
  { key: "Moon",            label: "Sleep",       category: "Sleep",        tags: ["night", "rest", "bed time", "8 hours"] },
  { key: "Bed",             label: "Bed",         category: "Sleep",        tags: ["rest", "sleep", "comfort", "night"] },
  { key: "BedDouble",       label: "Rest Day",    category: "Sleep",        tags: ["recover", "nap", "rest", "recharge"] },
  { key: "CloudMoon",       label: "Night",       category: "Sleep",        tags: ["night sky", "dreaming", "evening"] },
  { key: "Sunrise",         label: "Wake Up",     category: "Sleep",        tags: ["morning", "alarm", "start day", "early"] },
  { key: "Sunset",          label: "Wind Down",   category: "Sleep",        tags: ["evening", "relax", "end day", "routine"] },

  // ── Mind ─────────────────────────────────────────────────────────────────
  { key: "Smile",           label: "Mood",        category: "Mind",         tags: ["happy", "emotion", "journal", "feeling"] },
  { key: "Leaf",            label: "Nature",      category: "Mind",         tags: ["calm", "outdoors", "green", "grounding"] },
  { key: "Sprout",          label: "Growth",      category: "Mind",         tags: ["plant", "grow", "develop", "potential"] },
  { key: "Gem",             label: "Mindfulness", category: "Mind",         tags: ["crystal", "clarity", "precious", "rare"] },
  { key: "Puzzle",          label: "Challenge",   category: "Mind",         tags: ["problem solving", "brain", "logic", "strategy"] },
  { key: "Sparkle",         label: "Gratitude",   category: "Mind",         tags: ["thankful", "positive", "shine", "appreciate"] },
  { key: "HeartHandshake",  label: "Kindness",    category: "Mind",         tags: ["compassion", "help", "care", "empathy"] },
  { key: "Flower2",         label: "Peace",       category: "Mind",         tags: ["bloom", "garden", "peaceful", "calm"] },
  { key: "PawPrint",        label: "Pet Care",    category: "Mind",         tags: ["dog", "cat", "animal", "walk", "pet"] },
  { key: "Globe",           label: "Perspective", category: "Mind",         tags: ["explore", "global", "world", "open minded"] },

  // ── Finance ──────────────────────────────────────────────────────────────
  { key: "DollarSign",      label: "Money",       category: "Finance",      tags: ["income", "salary", "cash", "earn"] },
  { key: "PiggyBank",       label: "Savings",     category: "Finance",      tags: ["save", "budget", "piggy", "goal"] },
  { key: "TrendingUp",      label: "Investing",   category: "Finance",      tags: ["invest", "profit", "increase", "growth"] },
  { key: "TrendingDown",    label: "Cut Costs",   category: "Finance",      tags: ["reduce", "spending", "decrease", "less"] },
  { key: "CreditCard",      label: "Card",        category: "Finance",      tags: ["payment", "bank", "credit", "debit"] },
  { key: "Wallet",          label: "Budget",      category: "Finance",      tags: ["budget", "cash", "spending", "limit"] },
  { key: "Coins",           label: "Coins",       category: "Finance",      tags: ["change", "small savings", "spare", "coins"] },
  { key: "ChartBar",        label: "Stats",       category: "Finance",      tags: ["statistics", "data", "compare", "track"] },
  { key: "ChartLine",       label: "Progress",    category: "Finance",      tags: ["trend", "progress", "graph", "track"] },
  { key: "Landmark",        label: "Bank",        category: "Finance",      tags: ["banking", "government", "wealth", "institution"] },
  { key: "Briefcase",       label: "Business",    category: "Finance",      tags: ["work", "job", "career", "entrepreneur"] },
  { key: "Receipt",         label: "Expenses",    category: "Finance",      tags: ["bill", "track spending", "record", "log"] },

  // ── Learning ─────────────────────────────────────────────────────────────
  { key: "BookOpen",        label: "Reading",     category: "Learning",     tags: ["books", "study", "literature", "pages"] },
  { key: "GraduationCap",   label: "Education",   category: "Learning",     tags: ["school", "degree", "learn", "course"] },
  { key: "Lightbulb",       label: "Idea",        category: "Learning",     tags: ["insight", "creativity", "spark", "innovation"] },
  { key: "PenLine",         label: "Writing",     category: "Learning",     tags: ["journal", "notes", "write", "essay"] },
  { key: "Code",            label: "Coding",      category: "Learning",     tags: ["programming", "developer", "tech", "software"] },
  { key: "Library",         label: "Library",     category: "Learning",     tags: ["books", "knowledge", "resource", "reference"] },
  { key: "Telescope",       label: "Explore",     category: "Learning",     tags: ["observe", "science", "discover", "astronomy"] },
  { key: "Feather",         label: "Creative",    category: "Learning",     tags: ["writing", "poetry", "artistic", "prose"] },
  { key: "Map",             label: "Planning",    category: "Learning",     tags: ["map", "navigate", "strategy", "plan"] },
  { key: "Calculator",      label: "Math",        category: "Learning",     tags: ["numbers", "calculate", "finance", "math"] },
  { key: "Languages",       label: "Language",    category: "Learning",     tags: ["foreign", "speak", "translate", "duolingo"] },
  { key: "BookMarked",      label: "Bookmark",    category: "Learning",     tags: ["save", "reference", "note", "mark"] },
  { key: "NotebookPen",     label: "Notebook",    category: "Learning",     tags: ["journal", "diary", "notes", "log"] },

  // ── Social ───────────────────────────────────────────────────────────────
  { key: "Users",           label: "Community",   category: "Social",       tags: ["group", "team", "people", "networking"] },
  { key: "MessageCircle",   label: "Chat",        category: "Social",       tags: ["talk", "message", "connect", "dm"] },
  { key: "Phone",           label: "Call",        category: "Social",       tags: ["contact", "reach out", "talk", "call"] },
  { key: "Mail",            label: "Email",       category: "Social",       tags: ["message", "contact", "inbox", "send"] },
  { key: "Video",           label: "Video Call",  category: "Social",       tags: ["zoom", "meet", "virtual", "hang out"] },
  { key: "UserPlus",        label: "Network",     category: "Social",       tags: ["connect", "friend", "add", "new people"] },
  { key: "Share2",          label: "Share",       category: "Social",       tags: ["spread", "post", "publish", "social media"] },
  { key: "Handshake",       label: "Agreement",   category: "Social",       tags: ["deal", "partner", "trust", "collaboration"] },
  { key: "PartyPopper",     label: "Celebrate",   category: "Social",       tags: ["celebration", "fun", "event", "milestone"] },

  // ── Productivity ──────────────────────────────────────────────────────────
  { key: "Target",          label: "Goal",        category: "Productivity", tags: ["aim", "objective", "focus", "target"] },
  { key: "Trophy",          label: "Achievement", category: "Productivity", tags: ["win", "success", "award", "milestone"] },
  { key: "Star",            label: "Priority",    category: "Productivity", tags: ["important", "favorite", "highlight", "top"] },
  { key: "Rocket",          label: "Launch",      category: "Productivity", tags: ["startup", "boost", "growth", "accelerate"] },
  { key: "SquareCheck",     label: "Done",        category: "Productivity", tags: ["complete", "tick", "finished", "check"] },
  { key: "ClipboardList",   label: "Checklist",   category: "Productivity", tags: ["tasks", "todo", "list", "items"] },
  { key: "Flag",            label: "Milestone",   category: "Productivity", tags: ["mark", "event", "complete", "checkpoint"] },
  { key: "Bell",            label: "Reminder",    category: "Productivity", tags: ["alert", "notify", "schedule", "ping"] },
  { key: "AlarmClock",      label: "Alarm",       category: "Productivity", tags: ["wake up", "reminder", "time", "alarm"] },
  { key: "Gauge",           label: "Performance", category: "Productivity", tags: ["speed", "meter", "performance", "kpi"] },
  { key: "ListTodo",        label: "To-Do",       category: "Productivity", tags: ["tasks", "list", "check", "agenda"] },
  { key: "LayoutDashboard", label: "Dashboard",   category: "Productivity", tags: ["overview", "track", "organize", "control"] },
  { key: "Kanban",          label: "Kanban",      category: "Productivity", tags: ["board", "tasks", "workflow", "agile"] },

  // ── Lifestyle ────────────────────────────────────────────────────────────
  { key: "Music",           label: "Music",       category: "Lifestyle",    tags: ["listen", "practice", "playlist", "instrument"] },
  { key: "Camera",          label: "Photography", category: "Lifestyle",    tags: ["photo", "shoot", "capture", "pictures"] },
  { key: "Home",            label: "Home",        category: "Lifestyle",    tags: ["house", "chores", "clean", "tidy"] },
  { key: "ShoppingCart",    label: "Groceries",   category: "Lifestyle",    tags: ["buy", "groceries", "errands", "shop"] },
  { key: "Smartphone",      label: "Digital",     category: "Lifestyle",    tags: ["phone", "screen time", "app", "limit"] },
  { key: "Gamepad2",        label: "Gaming",      category: "Lifestyle",    tags: ["play", "games", "relax", "entertainment"] },
  { key: "Headphones",      label: "Podcast",     category: "Lifestyle",    tags: ["listen", "audio", "podcast", "audiobook"] },
  { key: "Tv",              label: "TV",          category: "Lifestyle",    tags: ["watch", "screen", "media", "streaming"] },
  { key: "Car",             label: "Driving",     category: "Lifestyle",    tags: ["commute", "transport", "drive", "car"] },
  { key: "Plane",           label: "Travel",      category: "Lifestyle",    tags: ["trip", "vacation", "fly", "adventure"] },
  { key: "Scissors",        label: "Crafts",      category: "Lifestyle",    tags: ["create", "diy", "make", "craft"] },
  { key: "Brush",           label: "Art",         category: "Lifestyle",    tags: ["paint", "creative", "draw", "artist"] },
  { key: "Palette",         label: "Design",      category: "Lifestyle",    tags: ["color", "creative", "art", "visual"] },
  { key: "Shirt",           label: "Fashion",     category: "Lifestyle",    tags: ["clothes", "style", "dress", "wardrobe"] },
  { key: "Watch",           label: "Time",        category: "Lifestyle",    tags: ["schedule", "punctual", "track", "manage"] },
  { key: "Trees",           label: "Nature Walk", category: "Lifestyle",    tags: ["outdoors", "forest", "hiking", "green"] },
  { key: "Mountain",        label: "Hiking",      category: "Lifestyle",    tags: ["climb", "outdoor", "adventure", "peak"] },
];

export const ICON_KEYS = Object.keys(HABIT_ICON_MAP) as HabitIconKey[];
