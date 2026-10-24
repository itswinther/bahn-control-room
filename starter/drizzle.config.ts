import "dotenv/config"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  // Our tables are listed too, or `db:push` would offer to drop them as unknown.
  schema: ["./lib/schema.ts", "./lib/schema-ours.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://controlroom:controlroom@localhost:5438/controlroom" },
})
