import { AGENT_TOOLS } from './agentTools'
import { TOOL_SYSTEM_SUFFIX } from './systemPrompt'
import { parseToolCall, stripToolCallJSON, parseToolTokens } from './toolParser'
import { runDoctorDiagnosticChain, detectDoctorCategory, type DoctorDiagnosis } from './doctorTools'

// ── Shared types (kept local to avoid circular deps with App.tsx) ─────

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'error' | 'agent'
  content: string
}

export interface Secret {
  id: string
  type: 'api_key' | 'password' | 'passcode' | 'note' | 'id' | 'token' | 'bank'
  label: string
  value: string
  provider?: string
  createdAt: number
}

export interface ProviderInfo {
  label: string
  color: string
  baseUrl: string
}

// ── callAI dependencies interface ──────────────────────────────────────

export interface CallAIDeps {
  selectedModel: string
  ollamaHost: string
  secrets: Secret[]
  PROVIDER_CONFIG: Record<string, ProviderInfo>
}

/**
 * Call the AI model (Ollama or OpenAI-compatible cloud API).
 * Extracted from the App component — receives all dependencies explicitly.
 */
export async function callAI(
  sysPrompt: string,
  msgs: Message[],
  deps: CallAIDeps,
): Promise<string> {
  const { selectedModel, ollamaHost, secrets, PROVIDER_CONFIG } = deps
  const colonIdx = selectedModel.indexOf(':')
  const provider = selectedModel.slice(0, colonIdx)
  const modelName = selectedModel.slice(colonIdx + 1)
  if (!provider || !modelName) throw new Error(`INVALID MODEL: "${selectedModel}"`)

  const apiKey = secrets.find(s => s.provider === provider)?.value
  const config = PROVIDER_CONFIG[provider]

  if (provider !== 'ollama' && !apiKey) {
    throw new Error(`NO CREDENTIAL FOR ${provider.toUpperCase()} — ADD KEY TO VAULT`)
  }

  const systemMsg: Message = { role: 'system', content: sysPrompt }

  if (provider === 'ollama') {
    const host = ollamaHost || 'http://localhost:11434'
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, messages: [systemMsg, ...msgs], stream: false }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Ollama error (${res.status}): ${errText}`)
    }
    const data = await res.json()
    return data.message?.content || JSON.stringify(data)
  } else if (config) {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: modelName, messages: [systemMsg, ...msgs] }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`${provider.toUpperCase()} error (${res.status}): ${errText}`)
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || JSON.stringify(data)
  } else {
    throw new Error(`Unknown provider: ${provider}`)
  }
}

// ── sendMessage dependencies interface ─────────────────────────────────

export interface SendMessageDeps {
  // State reads
  input: string
  loading: boolean
  messages: Message[]
  selectedModel: string
  ollamaHost: string
  secrets: Secret[]
  watchedFolders: string[]
  customPrompt: string
  healthData: any
  // Constants injected by App.tsx
  SYSTEM_PROMPT: string
  PROVIDER_CONFIG: Record<string, ProviderInfo>
  // State setters
  setInput: (val: string) => void
  setMessages: (updater: Message[] | ((prev: Message[]) => Message[])) => void
  setLoading: (val: boolean) => void
  setDoctorLog: (updater: string[] | ((prev: string[]) => string[])) => void
  // Log function
  log: (msg: string) => void
}

/**
 * Agent tool-call loop — sends message, checks for tool call, executes tool,
 * re-prompts with result, sanitizes response.
 *
 * Extracted from the App component — receives all React state/setters via deps.
 */
export async function sendMessage(deps: SendMessageDeps): Promise<void> {
  const {
    input,
    loading,
    messages,
    selectedModel,
    ollamaHost,
    secrets,
    watchedFolders,
    customPrompt,
    healthData,
    SYSTEM_PROMPT,
    PROVIDER_CONFIG,
    setInput,
    setMessages,
    setLoading,
    setDoctorLog,
    log,
  } = deps

  if (!input.trim() || loading) return

  const userText = input
  setInput('')
  setMessages(prev => [...prev, { role: 'user', content: userText }])
  setLoading(true)
  log(`MSG_SENT → ${selectedModel}`)

  // ── INTELLIGENT DOCTOR DIAGNOSTIC CHAIN ─────────────────────
  const userTextLower = userText.toLowerCase().trim()

  // Quick direct match for simple doctor commands (keep existing fast path)
  if (userTextLower.includes('clean temporary files') || userTextLower.includes('clean temp') || userTextLower.includes('cleanup temp') || userTextLower.includes('clear temp')) {
    setMessages(prev => [...prev, { role: 'agent', content: '⚙ Executing doctorCleanTemp...' }])
    try {
      const result = await AGENT_TOOLS.doctorCleanTemp()
      const resultMsg = `[TOOL RESULT: doctorCleanTemp] Removed ${result.removed || 0} files, freed ${result.freedMB || 0}MB`
      setMessages(prev => [...prev, { role: 'system', content: resultMsg }])
      log(resultMsg)
      setLoading(false)
      return
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'error', content: `Tool error: ${err.message}` }])
      setLoading(false)
      return
    }
  }

  // Check if this is a broader doctor/intelligent query that needs diagnostic chains
  let doctorDiagnosis: DoctorDiagnosis | null = null
  const doctorCategory = detectDoctorCategory(userTextLower)
  if (doctorCategory !== 'general' || userTextLower.includes('diagnose') || userTextLower.includes('health') || userTextLower.includes('check')) {
    log(`[DOCTOR] Detected ${doctorCategory} query, starting diagnostic chain...`)
    setMessages(prev => [...prev, { role: 'agent', content: `🔍 Running ${doctorCategory} diagnostics...` }])
    try {
      doctorDiagnosis = await runDoctorDiagnosticChain(userText)
      log(`[DOCTOR] Chain complete: ${doctorDiagnosis.findings.length} findings`)
    } catch (chainErr: any) {
      log(`[DOCTOR] Chain error: ${chainErr.message}`)
      // Non-fatal — continue with normal AI flow, chain error is logged but doesn't block
    }
  }

  const effectiveSystem = customPrompt
    ? `${customPrompt}\n\n---\n\n${SYSTEM_PROMPT}`
    : SYSTEM_PROMPT
  const healthContext = healthData
    ? `\n\n[SYSTEM CONTEXT]\n${JSON.stringify(healthData, null, 2)}`
    : ''

  // Pre-scan detection must happen BEFORE folderContext so we can make it dynamic
  const folderLabels = watchedFolders.map(f => ({
    path: f,
    label: f.split('\\').pop()?.split('/').pop() || f,
  }))
  const watchedKeywords = [
    ...watchedFolders.map(f => f.toLowerCase()),
    ...folderLabels.map(f => f.label.toLowerCase()),
    'watched folder',
    'subfolder',
    'sub-folder',
    'sub directory',
    'folders',
    'folder tree',
    'directory tree',
    'directory structure',
    'what is in',
    "what's inside",
    'whats inside',
    'tell me about',
    'list',
    'contents',
    'structure',
    'hierarchy',
    'show me',
    'inside',
    'nested',
    'deep scan',
    'scan folder',
    'file tree',
    'dir tree',
    'summarize',
    'summarize',
    'analyze',
    'analysis',
    'find',
    'search',
    'documents',
    'pdf',
    'content',
    'overview',
    'describe',
    'explain',
    'about',
  ]
  const contentKeywords = ['summarize', 'summarize', 'analyze', 'analysis', 'find', 'search', 'about', 'tell me about', 'documents', 'pdf', 'content', 'overview', 'describe', 'explain']
  const mentionsWatched = watchedFolders.length > 0 && watchedKeywords.some(kw => userTextLower.includes(kw))
  const needsContentAnalysis = watchedFolders.length > 0 && contentKeywords.some(kw => userTextLower.includes(kw))

  // Dynamic folderContext — adapts to content vs structure questions
  const folderContext = watchedFolders.length > 0
    ? needsContentAnalysis
      ? `\n\n[WATCHED FOLDERS]\nThe user has granted read access to:\n${folderLabels.map(f => `  - ${f.path} (label: "${f.label}")`).join('\n')}\n\nDOCUMENT ANALYSIS MODE ACTIVE.\n⚠️ YOU ARE AN INTELLIGENT PERSONAL ASSISTANT. SYNTHESIZE. DO NOT DUMP RAW DATA.\n✅ DATA ALREADY SCANNED — watchedFoldersAnalyze() has been called and attached below.\n✅ USE the attached data directly — do NOT call watchedFoldersAnalyze or watchedFoldersDeepScan.\n✅ SYNTHESIZE a narrative organized by topic or person profile.\n✅ Focus on KEY FINDINGS and INSIGHTS, not file lists.\n✅ Use preview excerpts SPARINGLY — only when they add unique value.\n❌ DO NOT output {"tool":"..."} — the data is already here. Answer in plain English.\n❌ DO NOT dump 10+ preview lines in a row. Synthesize.`
      : `\n\n[WATCHED FOLDERS]\nThe user has granted read access to:\n${folderLabels.map(f => `  - ${f.path} (label: "${f.label}")`).join('\n')}\n\nSTRICT FILESYSTEM MODE ACTIVE.\n✅ DATA ALREADY SCANNED — watchedFoldersDeepScan() has been called and the full folder tree is attached below.\n✅ USE the attached data directly — do NOT call watchedFoldersDeepScan again.\nOnly directories listed with (dir) suffix; de-emphasize files unless asked.\nNever invent names — only mention names that appear in the data.\n❌ Do NOT output {"tool":"watchedFoldersDeepScan","args":{}} — the data is already here.`
    : ''

  // Doctor diagnosis context — inject structured findings if a diagnostic chain ran
  const doctorContext = doctorDiagnosis
    ? `\n\n[DOCTOR DIAGNOSTIC RESULTS]\n${doctorDiagnosis.label}\n${doctorDiagnosis.summary}\n\nFindings (prioritized):\n${doctorDiagnosis.findings.map(f => `[${f.severity.toUpperCase()}] ${f.icon} ${f.title}: ${f.detail}`).join('\n')}\n\nFull data available in the [DOCTOR DATA] message below.`
    : ''

  const fullSystemPrompt = effectiveSystem + TOOL_SYSTEM_SUFFIX + healthContext + folderContext + doctorContext

  try {
    let preScannedData: any = null
    let usedToolName = ''
    if (needsContentAnalysis) {
      usedToolName = 'watchedFoldersAnalyze'
      log(`AUTO_PRE_SCAN: content analysis needed, using ${usedToolName}...`)
      const scanFn = AGENT_TOOLS.watchedFoldersAnalyze
      preScannedData = await (scanFn as any)({})
      log(`PRE_SCAN_COMPLETE: content analysis done`)
    } else if (mentionsWatched) {
      usedToolName = 'watchedFoldersDeepScan'
      log(`AUTO_PRE_SCAN: structure question, using ${usedToolName}...`)
      const scanFn = AGENT_TOOLS.watchedFoldersDeepScan
      preScannedData = await (scanFn as any)({})
      log(`PRE_SCAN_COMPLETE: ${(preScannedData as any).snapshots?.length || '?'} folder(s) scanned`)
    }

    // Build messages array — inject pre-scanned data before AI response if available
    const msgsForAI: Message[] = [...messages, { role: 'user', content: userText }]
    if (preScannedData) {
      const isContent = usedToolName === 'watchedFoldersAnalyze'
      msgsForAI.push({
        role: 'user',
        content: `⚠️ CRITICAL: YOU MUST FOLLOW THESE DIRECTIONS. DO NOT QUOTE THEM. DO NOT DUMP RAW DATA. USE THE DATA BELOW TO ANSWER INTELLIGENTLY.\n\n${isContent
          ? `⚠️ CONTENT ANALYSIS MODE — SYNTHESIS REQUIRED:\n- 🚫 NEVER dump raw preview text or list files one by one. That is USELESS.\n- ✅ You are a SMART ASSISTANT. Synthesize key findings organized by topic.\n- 🔍 If user asked about a PERSON: IMMEDIATELY create a structured Person Profile with:\n    👤 Full name, 👨‍👩‍👧 Relationships, 💰 Financials (bank names, balances, income),\n    ⚖️ Legal matters (case numbers, court names, filings), 🏥 Healthcare,\n    📅 Key dates, 📁 Source documents (exact filenames).\n    State facts directly: "Bank of America account ****4832 — $2,340"\n    NOT "the preview mentions..." — just state it with Source: at the end.\n- 📊 If user asked about a TOPIC: group by sub-theme with specific numbers/dates/entities.\n- 📁 Use 📁/📄 sparingly. Only include preview excerpts when they add unique value.\n- ⚠️ If preview text is garbled (flagged as unreadable): say "text quality is poor — likely scanned" ONCE only.\n- ❌ If something isn't in the data: say "not found in scanned folders" — NEVER guess.\n- 🚫 NEVER output {"tool":"..."} — the tool already ran. Answer in PLAIN ENGLISH.\n- 🚫 NEVER hallucinate filenames or content.\n\n${'─'.repeat(60)}\n[ATTACHED DATA from ${usedToolName}()]:\n${JSON.stringify(preScannedData, null, 2)}`
          : `DIRECTIVES (structure analysis):\n- THIS IS THE ACTUAL FILESYSTEM — never invent names.\n- List DIRECTORIES FIRST with "(dir)" suffix.\n- Only mention files if user explicitly asks about them.\n- If user asks about folders/subfolders: ONLY list directories, ignore files.\n- If a name isn't in the data: "I don't see 'X' in the actual folder listing."\n- NEVER output {"tool":"..."} — data is already here. Answer in plain English.\n\n${'─'.repeat(60)}\n[ATTACHED DATA from ${usedToolName}()]:\n${JSON.stringify(preScannedData, null, 2)}`
        }`,
      })
    }

    // Inject doctor diagnostic findings as structured data for AI reasoning
    if (doctorDiagnosis) {
      const fixSection = doctorDiagnosis.fixOptions.length > 0
        ? `\n\nAvailable Fix Options:\n${doctorDiagnosis.fixOptions.map((f, i) => `  ${i + 1}) ${f.label} — ${f.description}`).join('\n')}\n\nTo execute a fix, call: {"tool":"${doctorDiagnosis.fixOptions[0].tool}","args":${JSON.stringify(doctorDiagnosis.fixOptions[0].args)}}\nPresent these as numbered options to the user. When they pick one, call the corresponding tool. Always confirm before destructive actions.`
        : ''
      msgsForAI.push({
        role: 'user',
        content: `[DOCTOR DATA]\nDiagnostic category: ${doctorDiagnosis.category}\nSummary: ${doctorDiagnosis.summary}\n\nFindings (prioritized by severity):\n${doctorDiagnosis.findings.map(f => `[${f.severity.toUpperCase()}] ${f.icon} ${f.title}: ${f.detail}`).join('\n')}${fixSection}\n\nRaw data:\n${JSON.stringify(doctorDiagnosis.rawData, null, 2)}\n\nUse these findings to answer the user's question. Synthesize naturally — like a helpful tech friend, not a robot. Present issues as a numbered list. Offer to fix with simple numbered options. Always ask before making changes.`,
      })
    }

    // Step 1: get initial AI response
    const callAIDeps: CallAIDeps = { selectedModel, ollamaHost, secrets, PROVIDER_CONFIG }
    let aiText = await callAI(fullSystemPrompt, msgsForAI, callAIDeps)

    // Step 2: check for structured tool call
    const toolCall = parseToolCall(aiText)
    console.log('TOOL CALL DETECTED', toolCall)
    if (toolCall) {
      // Show working indicator
      setMessages(prev => [...prev, { role: 'agent', content: `⚙ Executing: ${toolCall.tool}...` }])

      // Execute the tool with error handling
      let result: any
      try {
        const toolFn = (AGENT_TOOLS as any)[toolCall.tool]
        if (!toolFn) {
          result = { error: `Unknown tool: "${toolCall.tool}". Available tools: ${Object.keys(AGENT_TOOLS).join(', ')}` }
        } else {
          result = await (toolFn as any)(toolCall.args ?? {})
        }
      } catch (execErr: any) {
        result = { error: `Tool execution error: ${execErr.message}`, tool: toolCall.tool, args: toolCall.args }
      }

      // Log to doctor panel
      setDoctorLog(prev => [
        `[AGENT] ${toolCall.tool}(${JSON.stringify(toolCall.args ?? {})}) → ${JSON.stringify(result).slice(0, 200)}`,
        ...prev,
      ].slice(0, 50))

      // Step 3: re-prompt AI with tool result
      const toolResultMsg: Message = {
        role: 'user',
        content: `[TOOL RESULT: ${toolCall.tool}]\n${JSON.stringify(result, null, 2)}`,
      }
      aiText = await callAI(fullSystemPrompt, [
        ...messages,
        { role: 'user', content: userText },
        { role: 'assistant', content: aiText },
        toolResultMsg,
      ], callAIDeps)

      // Step 4: Safety check — if re-prompted AI STILL outputs tool-call JSON, force natural language
      const leakedCall = parseToolCall(aiText)
      if (leakedCall) {
        log(`LEAK_DETECTED: re-prompted AI output tool call "${leakedCall.tool}" instead of answering — force re-prompt`)
        const forceNLMsg: Message = {
          role: 'user',
          content: `⚠️ CRITICAL: Your previous response was a tool call ({"tool":"${leakedCall.tool}","args":${JSON.stringify(leakedCall.args)}}). That is NOT allowed — the tool has ALREADY executed and the result was provided above.\n\nYou MUST answer the user's question in PLAIN ENGLISH with narrative synthesis. Do NOT output any JSON. Do NOT call any tool. Just answer naturally using the tool result data provided.`,
        }
        aiText = await callAI(fullSystemPrompt, [
          ...messages,
          { role: 'user', content: userText },
          { role: 'assistant', content: aiText },
          forceNLMsg,
        ], callAIDeps)
        log(`LEAK_RECOVERED: ${aiText.slice(0, 60)}...`)
      }

      // Sanitize final response — strip any leaked tool-call JSON
      aiText = stripToolCallJSON(aiText)
      // Replace the working indicator with the final response
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: aiText }])
      log(`AI_RESPONSE: ${aiText.slice(0, 60)}...`)
    } else {
      // If the question was about watched folders but AI didn't call the tool, re-prompt with data
      if (mentionsWatched && !preScannedData) {
        log('FORCE_RE_SCAN: AI did not call tool, forcing watchedFoldersDeepScan...')
        const scanFn = AGENT_TOOLS.watchedFoldersDeepScan
        preScannedData = await (scanFn as any)({})
        const followUp: Message = {
          role: 'user',
          content: `[NOTE: You did not call watchedFoldersDeepScan(). Here is the REAL watched folder data — use it to answer the user's question. Never invent filenames.]\n${JSON.stringify(preScannedData, null, 2)}`,
        }
        aiText = await callAI(fullSystemPrompt, [
          ...messages,
          { role: 'user', content: userText },
          { role: 'assistant', content: aiText },
          followUp,
        ], callAIDeps)
      }

      // Sanitize final response — strip any leaked tool-call JSON
      aiText = stripToolCallJSON(aiText)
      setMessages(prev => [...prev, { role: 'assistant', content: aiText }])
      log(`AI_RESPONSE: ${aiText.slice(0, 60)}...`)

      // Legacy tool token parsing — some tools need lockboxTools, PRIVACY_SCAN uses privacyAPI
      const tokens = parseToolTokens(aiText)
      for (const token of tokens) {
        log(`TOOL_TRIGGERED: ${token.type}`)
        // Show working indicator before executing
        setMessages(prev => [...prev, { role: 'agent', content: `⚙ Executing: ${token.type}...` }])
        try {
          let result: string
          if (token.type === 'DIAGNOSE_NETWORK' || token.type === 'DIAGNOSE_SYSTEM' || token.type === 'LIST_FOLDER') {
            const tools = (window as any).lockboxTools
            if (!tools) {
              result = 'TOOL_ERROR: lockboxTools not available'
            } else if (token.type === 'DIAGNOSE_NETWORK') {
              result = await tools.diagnoseNetwork()
            } else if (token.type === 'DIAGNOSE_SYSTEM') {
              result = await tools.diagnoseSystem()
            } else {
              result = await tools.listFolder((token as any).path)
            }
          } else if (token.type === 'PRIVACY_SCAN') {
            if ((window as any).privacyAPI) {
              const scanResult = await (window as any).privacyAPI.scanSummary()
              const lines = []
              lines.push(`=== PRIVACY SENTINEL SCAN ===`)
              lines.push(`Time: ${scanResult.timestamp}`)
              lines.push('')
              lines.push(`[STARTUP] ${scanResult.startup?.totalCount ?? 0} items, ${scanResult.startup?.flaggedCount ?? 0} flagged`)
              scanResult.startup?.flagged?.forEach((f: any) => lines.push(`  ⚠ ${f.name} (${f.source})`))
              lines.push('')
              lines.push(`[HOSTS] ${scanResult.hosts?.totalEntries ?? 0} entries, ${scanResult.hosts?.anomalyCount ?? 0} anomalies`)
              scanResult.hosts?.anomalies?.slice(0, 5).forEach((a: any) => lines.push(`  [${a.type}] ${a.message}`))
              lines.push('')
              lines.push(`[PROCESSES] ${scanResult.processes?.totalCount ?? 0} running, ${scanResult.processes?.warningCount ?? 0} warnings`)
              scanResult.processes?.warnings?.slice(0, 5).forEach((w: any) => lines.push(`  [${w.type}] ${w.name} (PID ${w.pid}): ${w.reason}`))
              lines.push('')
              lines.push(`[DNS] ${scanResult.dns?.dnsCount ?? 0} servers, ${scanResult.dns?.warnings?.length ?? 0} warnings`)
              scanResult.dns?.warnings?.forEach((w: any) => lines.push(`  ${w.message}`))
              result = lines.join('\n')
            } else {
              result = 'PRIVACY_SCAN_ERROR: privacyAPI not available'
            }
          } else {
            result = 'TOOL_ERROR: unknown token type'
          }
          setMessages(prev => [...prev, { role: 'system', content: `SYSTEM_DIAGNOSTIC_RESULT:\n${result}` }])
        } catch (err: any) {
          setMessages(prev => [...prev, { role: 'system', content: `TOOL_ERROR: ${err.message}` }])
        }
      }
    }
  } catch (err: any) {
    setMessages(prev => [...prev, { role: 'error', content: `API_ERROR: ${err.message}` }])
  } finally {
    setLoading(false)
  }
}
