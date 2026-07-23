import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { visit } from "unist-util-visit"

const LINE_BREAK_NODES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "tableRow",
  "tableCell",
])

export function markdownToPlainText(
  markdown: string | null | undefined,
): string {
  if (!markdown) return ""

  let tree
  try {
    tree = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .parse(markdown)
  } catch {
    return markdown
  }

  const parts: string[] = []
  visit(tree, (node) => {
    const n = node as unknown as { type: string; value?: string; alt?: string }
    if (
      n.type === "text" ||
      n.type === "inlineCode" ||
      n.type === "inlineMath"
    ) {
      parts.push(n.value ?? "")
    } else if (n.type === "code" || n.type === "math") {
      parts.push("\n", n.value ?? "", "\n")
    } else if (n.type === "image") {
      parts.push(n.alt ?? "")
    } else if (n.type === "break") {
      parts.push("\n")
    } else if (LINE_BREAK_NODES.has(n.type)) {
      parts.push("\n")
    }
    return true
  })

  return parts
    .join("")
    .replace(/\n{2,}/g, "\n")
    .trim()
}
