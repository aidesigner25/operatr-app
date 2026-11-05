import { decodeAttachmentMessage } from "@/lib/shared/chat-attachment";

type Message = { role: string; content: string; status: string };

// Only unambiguous, stand-alone requests should suppress a fresh search.
export function isContinuationRequest(content: string) {
  return /^(?:please\s+)?(?:continue(?:\s+(?:on|please|where you (?:left off|stopped)))?|go on|carry on|finish(?:\s+(?:it|the response))?)[\s.!]*$/i.test(content.trim());
}

// Input ends with the current user message. Only interrupted assistant messages
// are rolled into the same assessment; completed responses may already be valued.
export function continuationTask(messages: Message[]) {
  let index = messages.length - 1;
  const current = messages[index];
  const continuation = current?.role === "user" && isContinuationRequest(current.content) && messages[index - 1]?.role === "assistant";
  const segments: string[] = [];
  if (continuation) {
    while (index >= 2 && messages[index].role === "user" && isContinuationRequest(messages[index].content) && messages[index - 1].role === "assistant" && messages[index - 1].status === "cancelled" && messages[index - 2].role === "user") {
      segments.unshift(messages[index - 1].content);
      index -= 2;
    }
  }
  const raw = messages[index]?.content || current?.content || "";
  return { isContinuation: Boolean(continuation), prompt: decodeAttachmentMessage(raw)?.prompt || raw, segments };
}
