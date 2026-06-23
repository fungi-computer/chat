export interface ContentPart {
  text?: string;
  thinking?: string;
  type: string;
}

export function extractText(content: ContentPart[] | string | unknown): string {
  if (typeof content === "string") return content.trimStart();
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n")
    .trimStart();
}

export function extractThinking(
  content: ContentPart[] | string | unknown,
): string | undefined {
  if (typeof content === "string" || !Array.isArray(content)) return undefined;
  const thinking = content.find((c) => c.type === "thinking");
  return thinking?.thinking?.trimStart();
}
