import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  ChatMessage,
  MapToolStreamChunk,
  ToolDefinition,
  ToolStreamChunk,
} from "./ai-provider";
import { streamMapToolResponse } from "./ai-map-stream";

export const DEFAULT_SYSTEM_PROMPT = `You are a transit route planning assistant for Toronto.

You help urban planners design new transit lines. When the user describes a route requirement,
respond conversationally and helpfully. If they ask you to generate a specific route, also output
a JSON block at the end of your message in this exact format:

\`\`\`route
{
  "name": "Route Name",
  "type": "subway" | "streetcar" | "bus",
  "color": "#hexcolor",
  "stops": [
    { "name": "Stop Name", "coords": [-79.3832, 43.6532] }
  ]
}
\`\`\`

Coordinates are [longitude, latitude] in WGS84. Only include the JSON block when generating
an actual route. Use realistic Toronto coordinates. Keep stop names concise.`;

type StoredAssistant = {
  name: string;
  systemPrompt: string;
};

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
};

type StoredThread = {
  assistantId: string;
  messages: StoredMessage[];
};

// 📖 Learn: a "factory function" creates and returns an object. The Maps
// (assistantStore, threadStore) are closed over — each call to
// createAnthropicProvider() gets its own private store.
export function createAnthropicProvider(): AIProvider {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const assistantStore = new Map<string, StoredAssistant>();
  const threadStore = new Map<string, StoredThread>();

  function getAssistant(id: string): StoredAssistant {
    const a = assistantStore.get(id);
    if (!a) throw new Error(`Unknown assistant: ${id}`);
    return a;
  }

  function getThread(id: string): StoredThread {
    const t = threadStore.get(id);
    if (!t) throw new Error(`Unknown thread: ${id}`);
    return t;
  }

  function extractText(content: Anthropic.Messages.Message["content"]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  return {
    async createAssistant(name, systemPrompt = DEFAULT_SYSTEM_PROMPT) {
      const assistantId = crypto.randomUUID();
      assistantStore.set(assistantId, { name, systemPrompt });
      return assistantId;
    },

    async createThread(assistantId) {
      getAssistant(assistantId);
      const threadId = crypto.randomUUID();
      threadStore.set(threadId, { assistantId, messages: [] });
      return threadId;
    },

    async *streamMessage(threadId, content, model = "claude-haiku-4-5-20251001", maxTokens = 600) {
      const thread = getThread(threadId);
      const assistant = getAssistant(thread.assistantId);
      const nextMessages: StoredMessage[] = [
        ...thread.messages,
        { role: "user", content },
      ];

      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: assistant.systemPrompt,
        messages: nextMessages,
      });

      let full = "";
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            full += event.delta.text;
            yield event.delta.text;
          }
        }
      } finally {
        if (full) {
          threadStore.set(threadId, {
            ...thread,
            messages: [...nextMessages, { role: "assistant", content: full }],
          });
        }
      }
    },

    // 📖 Learn: "tool_choice: { type: 'tool', name: '...' }" tells Claude it MUST call
    // that specific tool. The model can still write text first (its reasoning), then
    // calls the tool. We stream both: text chunks come as text_delta events; the tool
    // arguments arrive as input_json_delta fragments that we reassemble into JSON.
    async *streamMessageWithTool(threadId, content, tool: ToolDefinition, model = "claude-haiku-4-5-20251001", maxTokens = 900): AsyncGenerator<ToolStreamChunk> {
      const thread = getThread(threadId);
      const assistant = getAssistant(thread.assistantId);
      const nextMessages: StoredMessage[] = [
        ...thread.messages,
        { role: "user", content },
      ];

      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: assistant.systemPrompt,
        messages: nextMessages,
        tools: [{
          name: tool.name,
          description: tool.description,
          // 📖 Learn: Anthropic names this field "input_schema" (snake_case)
          // even though we store it as "inputSchema" in our shared ToolDefinition.
          input_schema: tool.inputSchema as Anthropic.Messages.Tool["input_schema"],
        }],
        // Force Claude to call exactly this tool (not just "maybe use a tool")
        tool_choice: { type: "tool", name: tool.name },
      });

      let fullText = "";
      let toolInputJson = "";

      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              fullText += event.delta.text;
              yield { type: "text", text: event.delta.text };
            } else if (event.delta.type === "input_json_delta") {
              // 📖 Learn: the tool JSON is streamed as fragments (e.g. '{"name"' then
              // ':"Eglinton"' then ',"stops":[' ...). We accumulate and parse at the end.
              toolInputJson += event.delta.partial_json;
            }
          }
        }
      } finally {
        // Store only the text portion — agents run once per council, so we don't need
        // the tool call in history for multi-turn continuity.
        if (fullText) {
          threadStore.set(threadId, {
            ...thread,
            messages: [...nextMessages, { role: "assistant", content: fullText }],
          });
        }
      }

      if (toolInputJson) {
        try {
          yield { type: "tool", input: JSON.parse(toolInputJson) as Record<string, unknown> };
        } catch {
          // Malformed JSON from the model — caller will treat route as null
        }
      }
    },

    async sendMessage(threadId, content, model = "claude-haiku-4-5-20251001", maxTokens = 600) {
      const thread = getThread(threadId);
      const assistant = getAssistant(thread.assistantId);
      const nextMessages: StoredMessage[] = [
        ...thread.messages,
        { role: "user", content },
      ];

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: assistant.systemPrompt,
        messages: nextMessages,
      });

      const text = extractText(response.content);
      threadStore.set(threadId, {
        ...thread,
        messages: [...nextMessages, { role: "assistant", content: text }],
      });
      return text;
    },

    async *streamMessageWithMapTools(
      threadId,
      content,
      model = "claude-haiku-4-5-20251001",
      maxTokens = 900,
    ): AsyncGenerator<MapToolStreamChunk> {
      const thread = getThread(threadId);
      const assistant = getAssistant(thread.assistantId);
      const history = thread.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const gen = streamMapToolResponse(client, {
        system: assistant.systemPrompt,
        history,
        userMessage: content,
        model,
        maxTokens,
      });

      let result = await gen.next();
      while (!result.done) {
        yield result.value;
        result = await gen.next();
      }

      const { assistantText, history: nextHistory } = result.value;
      const stored = nextHistory
        .filter((m): m is { role: "user" | "assistant"; content: string } =>
          typeof m.content === "string" && (m.role === "user" || m.role === "assistant"),
        )
        .map((m) => ({ role: m.role, content: m.content }));

      if (stored.length > 0) {
        threadStore.set(threadId, { ...thread, messages: stored });
      } else if (assistantText) {
        threadStore.set(threadId, {
          ...thread,
          messages: [
            ...thread.messages,
            { role: "user", content },
            { role: "assistant", content: assistantText },
          ],
        });
      }
    },

    async *streamDirect(system, messages: ChatMessage[], model = "claude-haiku-4-5-20251001", maxTokens = 1024) {
      // 📖 Learn: we pass the full message list directly (no assistant/thread lookup)
      // so the caller controls history. Anthropic accepts this format natively.
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    },
  };
}
