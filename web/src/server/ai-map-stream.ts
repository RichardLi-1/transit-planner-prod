import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import {
  mapTools,
  WRITE_MAP_TOOLS,
} from "./ai-map-tools";
import {
  handleQueryNetwork,
  validateWriteToolArgs,
} from "./ai-map-tools.handlers";

export type MapToolStreamChunk =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> };

type StoredMessage = Anthropic.Messages.MessageParam;

const MAX_TOOL_LOOPS = 6;

/**
 * Stream a map-assistant reply with Anthropic tool use.
 * query_network runs server-side; write tools are yielded to the client.
 */
export async function* streamMapToolResponse(
  client: Anthropic,
  params: {
    system: string;
    history: StoredMessage[];
    userMessage: string;
    model: string;
    maxTokens: number;
  },
): AsyncGenerator<MapToolStreamChunk, { assistantText: string; history: StoredMessage[] }> {
  let messages: StoredMessage[] = [
    ...params.history,
    { role: "user", content: params.userMessage },
  ];
  let assistantText = "";

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const stream = client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages,
      tools: mapTools,
      tool_choice: { type: "auto" },
    });

    let blockType: "text" | "tool" | null = null;
    let blockText = "";
    let toolId = "";
    let toolName = "";
    let toolJson = "";

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "text") {
          blockType = "text";
          blockText = "";
        } else if (event.content_block.type === "tool_use") {
          blockType = "tool";
          toolId = event.content_block.id;
          toolName = event.content_block.name;
          toolJson = "";
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          blockText += event.delta.text;
          assistantText += event.delta.text;
          yield { type: "text", delta: event.delta.text };
        } else if (event.delta.type === "input_json_delta") {
          toolJson += event.delta.partial_json;
        }
      } else if (event.type === "content_block_stop" && blockType === "tool" && toolName) {
        try {
          const args = JSON.parse(toolJson || "{}") as Record<string, unknown>;
          if (WRITE_MAP_TOOLS.has(toolName)) {
            if (validateWriteToolArgs(toolName, args)) {
              yield { type: "tool_call", name: toolName, args };
            } else {
              console.warn("[ai-map-tools] dropped invalid write tool:", toolName, args);
            }
          }
        } catch (e) {
          console.warn("[ai-map-tools] failed to parse tool JSON:", toolName, e);
        }
        blockType = null;
        toolName = "";
      }
    }

    const final = await stream.finalMessage();
    const toolUses = final.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      messages = [...messages, { role: "assistant", content: final.content }];
      return { assistantText, history: messages };
    }

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const tu of toolUses) {
      if (tu.name === "query_network") {
        const result = handleQueryNetwork(tu.input as Record<string, unknown>);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      } else if (WRITE_MAP_TOOLS.has(tu.name)) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify({ status: "rendered_on_map" }),
        });
      }
    }

    messages = [
      ...messages,
      { role: "assistant", content: final.content },
      { role: "user", content: toolResults },
    ];

    if (toolResults.every((r) => {
      const tu = toolUses.find((t) => t.id === r.tool_use_id);
      return tu && WRITE_MAP_TOOLS.has(tu.name);
    })) {
      return { assistantText, history: messages };
    }
  }

  return { assistantText, history: messages };
}
