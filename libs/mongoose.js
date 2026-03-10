import mongoose from "mongoose";

const uri = process.env.MONGODB_DIRECT_URI || process.env.MONGODB_URI;

const globalMongoose = globalThis;

const cached = globalMongoose.__mongoose ?? {
  conn: null,
  promise: null,
};

globalMongoose.__mongoose = cached;

const toConnectionError = (error) => {
  const message = error?.message || "Could not connect to MongoDB.";
  const isSrvLookupFailure =
    message.includes("querySrv") ||
    message.includes("_mongodb._tcp") ||
    error?.code === "ECONNREFUSED";

  if (isSrvLookupFailure && !process.env.MONGODB_DIRECT_URI) {
    return new Error(
      "MongoDB SRV lookup failed. Set MONGODB_DIRECT_URI in .env.local with the non-SRV Atlas connection string, or fix DNS access for the mongodb+srv URI."
    );
  }

  return new Error(message);
};

const connectMongo = async () => {
  if (!uri) {
    throw new Error(
      "Add MONGODB_URI (or MONGODB_DIRECT_URI) inside .env.local to use MongoDB."
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      })
      .then((mongooseInstance) => mongooseInstance)
      .catch((error) => {
        cached.promise = null;
        throw toConnectionError(error);
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

export default connectMongo;
