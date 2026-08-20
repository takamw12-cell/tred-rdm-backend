import { db } from "./database";
import { sql } from "drizzle-orm";
const uid = "IigELeVdIcw99FelrEFFc54EGbNq2pa7"; // takamw12@gmail.com
const docs:any[] = await db.all(sql`select id, title, semester_id from document where user_id=${uid}`);
const sems:any[] = await db.all(sql`select id, name from semester where user_id=${uid}`);
console.log("takamw12 -> semesters:", sems.length, JSON.stringify(sems));
console.log("takamw12 -> documents:", docs.length, JSON.stringify(docs.map(d=>d.title)));
// also totals per user for context
const allDocs:any[] = await db.all(sql`select user_id, count(*) c from document group by user_id`);
const allSems:any[] = await db.all(sql`select user_id, count(*) c from semester group by user_id`);
console.log("docs per user:", JSON.stringify(allDocs));
console.log("sems per user:", JSON.stringify(allSems));
process.exit(0);
