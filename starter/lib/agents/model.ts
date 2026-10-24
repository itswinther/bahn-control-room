import Anthropic from "@anthropic-ai/sdk"
import type { BetaContentBlock, BetaMessageParam, BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

// Where the agent's answers come from. Live calls Claude; replay feeds back recorded answers
// through the same loop, so the tools and database writes run for real and live == replay.

export type ModelTurn = { content: BetaContentBlock[]; stop_reason: string | null; delay_ms: number }
export type Recording = {
  order_id: string
  reason: string
  /** "live" for a recorded Claude run; "hand-written" for a simulation written before any key existed. */
  source: "live" | "hand-written"
  model: string
  recorded_at: string
  turns: ModelTurn[]
}

export type ModelSource = {
  next(messages: BetaMessageParam[]): Promise<{ content: BetaContentBlock[]; stop_reason: string | null }>
  /** Saves the turns of a live run; a no-op for replay. */
  save(): Promise<void>
}

const RECORDINGS = path.join(process.cwd(), "recordings")
const fileFor = (orderId: string, reason: string) => path.join(RECORDINGS, `${orderId}.${reason}.json`)

let client: Anthropic | null = null

export function liveSource(opts: { model: string; system: string; tools: BetaTool[]; orderId: string; reason: string; record: boolean }): ModelSource {
  const turns: ModelTurn[] = []
  let last = Date.now()
  return {
    async next(messages) {
      const response = await (client ??= new Anthropic()).beta.messages.create({
        model: opts.model,
        max_tokens: 16000,
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        tools: opts.tools,
        messages,
        output_config: { effort: "medium" },
        thinking: { type: "adaptive", display: "updates" },
        betas: ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"],
        fallbacks: "default",
      })
      turns.push({ content: response.content, stop_reason: response.stop_reason, delay_ms: Date.now() - last })
      last = Date.now()
      return response
    },
    async save() {
      if (!opts.record) return
      const recording: Recording = { order_id: opts.orderId, reason: opts.reason, source: "live", model: opts.model, recorded_at: new Date().toISOString(), turns }
      await mkdir(RECORDINGS, { recursive: true })
      await writeFile(fileFor(opts.orderId, opts.reason), JSON.stringify(recording, null, 2))
    },
  }
}

export async function replaySource(orderId: string, reason: string): Promise<ModelSource | null> {
  const raw = await readFile(fileFor(orderId, reason), "utf8").catch(() => null)
  if (!raw) return null
  const recording = JSON.parse(raw) as Recording
  let i = 0
  return {
    async next() {
      const turn = recording.turns[i++]
      if (!turn) return { content: [], stop_reason: "recording_ended" }
      await new Promise((r) => setTimeout(r, Math.min(turn.delay_ms, 4000)))
      return turn
    },
    async save() {},
  }
}
