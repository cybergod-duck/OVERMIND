import { AGENT_TOOLS } from './agentTools'
import { DOCTOR_COMMAND_MAP, FILE_COMMAND_MAP } from './systemPrompt'

// ── Types ──────────────────────────────────────────────────────────────

export type ToolToken =
  | { type: 'DIAGNOSE_NETWORK' }
  | { type: 'DIAGNOSE_SYSTEM' }
  | { type: 'LIST_FOLDER'; path: string }
  | { type: 'PRIVACY_SCAN' }

// ── Tool token regex ──────────────────────────────────────────────────

export const TOOL_TOKEN_RE = /\[TOOL:(DIAGNOSE_NETWORK|DIAGNOSE_SYSTEM|LIST_FOLDER\s+path="([^"]+)"|PRIVACY_SCAN)\]/g

export function parseToolTokens(text: string): ToolToken[] {
  const tokens: ToolToken[] = []
  let match: RegExpExecArray | null
  while ((match = TOOL_TOKEN_RE.exec(text)) !== null) {
    if (match[1].startsWith('LIST_FOLDER')) {
      tokens.push({ type: 'LIST_FOLDER', path: match[2] })
    } else if (match[1] === 'DIAGNOSE_NETWORK') {
      tokens.push({ type: 'DIAGNOSE_NETWORK' })
    } else if (match[1] === 'DIAGNOSE_SYSTEM') {
      tokens.push({ type: 'DIAGNOSE_SYSTEM' })
    } else if (match[1] === 'PRIVACY_SCAN') {
      tokens.push({ type: 'PRIVACY_SCAN' })
    }
  }
  return tokens
}

// ── Structured tool-call JSON parser ──────────────────────────────────

export function parseToolCall(text: string): { tool: string; args: any } | null {
  try {
    // ── Strategy 0: Handle { name, arguments } format (HIGHEST PRIORITY) ──
    // The model outputs {"name":"doctor","arguments":{"command":"clean_temp_files"}}
    // instead of the standard {"tool":"doctorCleanTemp","args":{}} format.
    // Also handles {"name":"watchedFoldersMoveFile","arguments":{...}}
    {
      // Brace-depth scan for { name, arguments } format
      let depth = 0
      let start = -1
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (ch === '{') {
          if (start === -1) start = i
          depth++
        } else if (ch === '}') {
          depth--
          if (depth === 0 && start !== -1) {
            const candidate = text.slice(start, i + 1)
            try {
              const parsed = JSON.parse(candidate)
              if (parsed.name && parsed.arguments) {
                // Map doctor commands
                if (parsed.name === 'doctor' && parsed.arguments.command) {
                  const cmd = parsed.arguments.command.toLowerCase().replace(/-/g, '_')
                  if (DOCTOR_COMMAND_MAP[cmd]) {
                    return { tool: DOCTOR_COMMAND_MAP[cmd], args: {} }
                  }
                }
                // Map file commands
                if ((parsed.name === 'file' || parsed.name === 'folder') && parsed.arguments.command) {
                  const cmd = parsed.arguments.command.toLowerCase().replace(/-/g, '_')
                  if (FILE_COMMAND_MAP[cmd]) {
                    const { command, ...rest } = parsed.arguments
                    return { tool: FILE_COMMAND_MAP[cmd], args: rest }
                  }
                }
                // Direct name-to-tool mapping (e.g., name: "watchedFoldersMoveFile")
                if (parsed.name in AGENT_TOOLS) {
                  return { tool: parsed.name, args: parsed.arguments ?? {} }
                }
              }
            } catch { /* not valid JSON, continue */ }
            start = -1
          }
        }
      }
    }

    // ── Strategy 1: Strip markdown code fences ──
    let cleaned = text.replace(/```[a-z]*\n?/gi, '').replace(/`/g, '').trim()

    // ── Strategy 2: Brace-depth scanner (handles text before/after JSON) ──
    let depth = 0
    let start = -1
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (ch === '{') {
        if (start === -1) start = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && start !== -1) {
          const candidate = cleaned.slice(start, i + 1)
          try {
            const parsed = JSON.parse(candidate)
            if (parsed.tool && parsed.tool in AGENT_TOOLS) return parsed
          } catch { /* not valid JSON, try next balanced pair */ }
          start = -1
        }
      }
    }

    // ── Strategy 3: Regex fallback ──
    const toolCallRegex = /\{"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^}]*\})\s*\}/g
    let match: RegExpExecArray | null
    while ((match = toolCallRegex.exec(cleaned)) !== null) {
      const toolName = match[1]
      if (toolName in AGENT_TOOLS) {
        try {
          const args = JSON.parse(match[2])
          return { tool: toolName, args }
        } catch {
          return { tool: toolName, args: {} }
        }
      }
    }

    // ── Strategy 4: Same regex fallback on raw text (if cleaning broke something) ──
    if (cleaned !== text) {
      const rawRegex = /\{"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^}]*\})\s*\}/g
      while ((match = rawRegex.exec(text)) !== null) {
        const toolName = match[1]
        if (toolName in AGENT_TOOLS) {
          try {
            const args = JSON.parse(match[2])
            return { tool: toolName, args }
          } catch {
            return { tool: toolName, args: {} }
          }
        }
      }
    }

    return null
  } catch { return null }
}

/**
 * Strip any remaining {"tool":"xxx","args":...} patterns from AI response text
 * before displaying to user. This is a safety net for any leaked tool-call JSON
 * that wasn't caught by parseToolCall + re-prompt logic.
 */
export function stripToolCallJSON(text: string): string {
  // Remove patterns like {"tool":"xxx","args":{}} or {"tool":"xxx","args":{"key":"val"}}
  let result = text.replace(/\{"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[^}]*\}\s*\}/g, '')
  // Also strip {"name":"doctor","arguments":{"command":"xxx"}} patterns
  result = result.replace(/\{"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[^}]*\}\s*\}/g, '')
  return result.trim()
}
