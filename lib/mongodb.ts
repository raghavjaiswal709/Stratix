import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
   
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose ?? { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      // Fail fast instead of hanging ~30s (the driver default) when Atlas is
      // unreachable — keeps API routes from leaving requests "pending" forever.
      serverSelectionTimeoutMS: 10000,
      // Allow long-running cursors but don't let a dead socket hang indefinitely.
      socketTimeoutMS: 45000,
      // Reuse a healthy pool across hot-reloads / concurrent requests.
      maxPoolSize: 10,
      minPoolSize: 1,
      // Keep idle sockets warm so we don't pay the TLS handshake on every burst.
      maxIdleTimeMS: 60000,
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
