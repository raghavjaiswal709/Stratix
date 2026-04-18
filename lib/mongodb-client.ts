/**
 * Cached MongoDB client for use with MongoDBAdapter (NextAuth).
 * Uses a global variable in dev to survive hot-reloads without
 * exhausting Atlas connection limits.
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;

if (!uri) {
  throw new Error("MONGODB_URI environment variable is not defined");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production each serverless function gets its own module instance;
  // a module-level client is fine and avoids the global overhead.
  const client = new MongoClient(uri);
  clientPromise = client.connect();
}

export default clientPromise;
