import { db } from "./database";
import { sql } from "drizzle-orm";
const rows:any[] = await db.all(sql`select id, email, name from user order by created_at`);
console.log("USERS ("+rows.length+"):");
for (const r of rows) console.log(" -", r.email, "| name:", r.name, "| id:", r.id);
process.exit(0);
