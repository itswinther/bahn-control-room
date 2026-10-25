// Messages to a driver in their own language. A machine translation goes out with the English under it, so a
// driver can catch a bad one. Shift Watch's fixed safety lines are written by people and go out on their own.
import Anthropic from "@anthropic-ai/sdk"
import { liveReading } from "./judge"

let client: Anthropic | null = null

export async function toDriverLanguage(english: string, language: string): Promise<string> {
  if (!language || language === "en" || !liveReading()) return english
  const response = await (client ??= new Anthropic()).messages.create({
    model: process.env.SHIFT_WATCH_MODEL ?? "claude-sonnet-5-5", max_tokens: 1000, output_config: { effort: "low" },
    system: `Translate the operations team's message to the driver into the language with ISO code "${language}". Keep times, references and names exactly. Use plain, everyday words a driver would use. Reply with the translation only.`,
    messages: [{ role: "user", content: english }],
  })
  const block = response.content.find((b) => b.type === "text")
  const translated = block?.type === "text" ? block.text.trim() : ""
  return translated && translated !== english ? `${translated}\n\n(English) ${english}` : english
}
