import { NextRequest } from "next/server";
import { getProvider, DEFAULT_SYSTEM_PROMPT } from "~/server/ai-provider";
import { trackChatMessage } from "~/server/discord";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      message: string;
      assistantId?: string;
      threadId?: string;
      systemPrompt?: string;
      model?: string;
      maxTokens?: number;
      provider?: string;
      /** When true, use map annotation tools (Anthropic only). */
      mapTools?: boolean;
    };

    const {
      message,
      assistantId: providedAssistantId,
      threadId: providedThreadId,
      systemPrompt = DEFAULT_SYSTEM_PROMPT,
      model = "claude-haiku-4-5-20251001",
      maxTokens = 600,
      provider,
      mapTools = false,
    } = body;

    void trackChatMessage({ message, model });

    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const aiProvider = getProvider(mapTools ? "anthropic" : provider);

    let assistantId = providedAssistantId;
    if (!assistantId) {
      assistantId = await aiProvider.createAssistant("Transit Planner", systemPrompt);
    }

    let threadId = providedThreadId;
    if (!threadId) {
      threadId = await aiProvider.createThread(assistantId);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "metadata", assistantId, threadId })}\n\n`,
            ),
          );

          const ai = aiProvider;

          if (mapTools && ai.streamMessageWithMapTools) {
            for await (const chunk of ai.streamMessageWithMapTools(
              threadId,
              message,
              model,
              maxTokens,
            )) {
              if (chunk.type === "text") {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "text", delta: chunk.delta })}\n\n`,
                  ),
                );
              } else if (chunk.type === "tool_call") {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "tool_call",
                      name: chunk.name,
                      args: chunk.args,
                    })}\n\n`,
                  ),
                );
              }
            }
          } else {
            for await (const chunk of ai.streamMessage(
              threadId,
              message,
              model,
              maxTokens,
            )) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "content", text: chunk })}\n\n`,
                ),
              );
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              })}\n\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Anthropic API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to process request",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
