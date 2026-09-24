import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL tanımlı değil");
  const { db, sql } = createDb(url);
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  await sql.end();
  console.log("Migration tamamlandı");
}

main().catch((err: unknown) => {
  console.error("Migration başarısız:", (err as Error).message);
  process.exit(1);
});
