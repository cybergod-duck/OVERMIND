// ── Image Generation Utility ─────────────────────────────────────
// Supports xAI/Grok API for image generation (grok-2-image or similar).
// Can be extended to support other providers (Stability AI, Together AI, etc.).

export interface ImageGenResult {
  success: boolean
  imageUrl?: string
  base64?: string
  error?: string
  provider?: string
}

export interface ImageGenDeps {
  prompt: string
  apiKey: string
  provider?: string
  model?: string
}

/**
 * Generate an image using the xAI/Grok image generation API.
 * xAI API: POST https://api.x.ai/v1/images/generations
 * Uses OpenAI-compatible image generation endpoint.
 */
async function generateWithXai(prompt: string, apiKey: string, model?: string): Promise<ImageGenResult> {
  const url = 'https://api.x.ai/v1/images/generations'
  const body = {
    model: model || 'grok-2-image',
    prompt,
    n: 1,
    response_format: 'b64_json', // Get base64 to avoid CORS/storage issues
  }

  const fetchFn = (window as any).systemAPI?.proxyFetch
    ? (u: string, o: any) => (window as any).systemAPI.proxyFetch(u, o)
    : async (u: string, o: any) => {
        const r = await fetch(u, o)
        const data = await r.json()
        return { ok: r.ok, status: r.status, data }
      }

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = res.data ? JSON.stringify(res.data) : `HTTP ${res.status}`
    return { success: false, error: `xAI image generation error (${res.status}): ${errText}`, provider: 'xai' }
  }

  const data = res.data

  // Handle b64_json response
  if (data.data?.[0]?.b64_json) {
    const base64 = data.data[0].b64_json
    const dataUrl = `data:image/png;base64,${base64}`
    return { success: true, imageUrl: dataUrl, base64, provider: 'xai' }
  }

  // Handle URL response
  if (data.data?.[0]?.url) {
    return { success: true, imageUrl: data.data[0].url, provider: 'xai' }
  }

  return { success: false, error: `Unexpected response format: ${JSON.stringify(data).slice(0, 200)}`, provider: 'xai' }
}

/**
 * Generate an image using the configured provider.
 * Currently supports: xai (xAI/Grok)
 */
export async function generateImage(deps: ImageGenDeps): Promise<ImageGenResult> {
  const { prompt, apiKey, provider } = deps

  if (!prompt.trim()) {
    return { success: false, error: 'Image prompt is required' }
  }

  if (!apiKey) {
    return { success: false, error: 'API key is required for image generation. Add an xAI/Grok key to the vault.' }
  }

  switch (provider || 'xai') {
    case 'xai':
      return generateWithXai(prompt, apiKey, deps.model)
    default:
      return { success: false, error: `Unsupported image provider: ${provider}. Supported: xai` }
  }
}
