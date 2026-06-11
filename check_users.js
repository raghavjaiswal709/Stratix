const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://Raghav8709:Rahgav8709@cluster0.dfryo6e.mongodb.net/Stratix";

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    const db = client.db();
    const users = await db.collection("users").find({}).toArray();
    console.log("Users in Database:");
    console.log(users.map(u => ({ id: u._id.toString(), name: u.name, email: u.email, role: u.role })));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

main();
