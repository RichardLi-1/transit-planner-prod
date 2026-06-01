import { type NextRequest } from "next/server";

const ELEVENLABS_KEY = process.env.ELEVENLABS_KEY ?? "";

// Voice IDs per agent character
const VOICE_MAP: Record<string, string> = {
  "Alex Chen":          "nPczCjzI2devNBz1zQrb", // Brian - calm, analytical
  "Jordan Park":        "TxGEqnHWrfWFTfGW9XjX", // Josh - measured, critical
  "Margaret Thompson":  "EXAVITQu4vr4xnSDxMaL", // Bella - sharp, concerned
  "Devon Walsh":        "VR6AewLTigWG4xSOukaG", // Arnold - PR polished
  "Alex & Jordan":      "pNInz6obpgDQGcFmaJgB", // Adam - confident, decisive
  "Planning Commission":"onwK4e9ZLuTAKqWW03F9", // Daniel - authoritative
};

export async function POST(req: NextRequest) {
  if (!ELEVENLABS_KEY) return new Response("TTS not configured", { status: 503 });
  const { text, agent } = await req.json() as { text: string; agent: string };
  const voiceId = VOICE_MAP[agent] ?? VOICE_MAP["Alex Chen"]!;

  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.3 },
    }),
  });

  if (!resp.ok) {
    return new Response("TTS failed", { status: resp.status });
  }

  return new Response(resp.body, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
