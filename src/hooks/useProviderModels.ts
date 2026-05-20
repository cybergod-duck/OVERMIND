import { useState, useEffect } from 'react'
import type { Secret } from '../types/vault'
import { OPENROUTER_MODELS } from '../constants/providers'

export function useProviderModels(secrets: Secret[], onError?: (msg: string) => void) {
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({})
  const [providerFetchErrors, setProviderFetchErrors] = useState<Record<string, string>>({})
  const [fetchingModels, setFetchingModels] = useState(false)

  const getKey = (id: string): string => {
    let s = secrets.find(s => s.provider === id && s.type === 'api_key')
    if (s) return s.value
    s = secrets.find(s =>
      s.type === 'api_key' &&
      (s.label.toUpperCase().includes(id.toUpperCase()) ||
       (id === 'xai' && s.label.toUpperCase().includes('GROK')))
    )
    return s?.value || ''
  }

  const fetchLiveModels = async () => {
    setFetchingModels(true)
    const fetches: Promise<void>[] = []

    const trackFetch = (name: string, providerKey: string, url: string, options: any, setter: (data: any) => void) => {
      const p = (window as any).systemAPI?.proxyFetch
        ? (window as any).systemAPI.proxyFetch(url, options)
        : fetch(url, options).then(async res => ({ ok: res.ok, status: res.status, data: await res.json() }))

      fetches.push(
        p.then((res: any) => {
          if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
          setter(res.data)
          setProviderFetchErrors(prev => {
            const next = { ...prev }
            delete next[providerKey]
            return next
          })
          console.log(`[MODELS] ${name} updated`)
        })
        .catch((err: Error) => {
          console.error(`[MODELS] ${name} fetch failed:`, err)
          setProviderFetchErrors(prev => ({ ...prev, [providerKey]: err.message }))
          if (onError) onError(`[ERR] ${name} models fetch failed: ${err.message}`)
        })
      )
    }

    const grokKey = getKey('GROK') || getKey('XAI')
    if (grokKey) trackFetch('XAI', 'xai',
      'https://api.x.ai/v1/models',
      { headers: { Authorization: `Bearer ${grokKey}` } },
      (d) => setProviderModels(prev => ({ ...prev, xai: d.data?.map((m: any) => m.id) ?? [] }))
    )

    const anthropicKey = getKey('ANTHROPIC')
    if (anthropicKey) {
      const p = (window as any).systemAPI?.anthropicRequest
        ? (window as any).systemAPI.anthropicRequest({
            endpoint: '/v1/models', method: 'GET',
            headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'accept': 'application/json' }
          })
        : fetch('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'accept': 'application/json' }
          }).then(async res => ({ ok: res.ok, status: res.status, data: await res.json() }))
      fetches.push(
        p.then((res: any) => {
          if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
          setProviderModels(prev => ({ ...prev, anthropic: res.data.data?.map((m: any) => m.id) ?? [] }))
          setProviderFetchErrors(prev => { const next = { ...prev }; delete next['anthropic']; return next })
        })
        .catch((err: Error) => setProviderFetchErrors(prev => ({ ...prev, anthropic: err.message })))
      )
    }

    const moonshotKey = getKey('MOONSHOT')
    if (moonshotKey) {
      const p = (window as any).systemAPI?.moonshotRequest
        ? (window as any).systemAPI.moonshotRequest({
            endpoint: '/v1/models', method: 'GET',
            headers: { Authorization: `Bearer ${moonshotKey}` }
          })
        : fetch('https://api.moonshot.ai/v1/models', {
            headers: { Authorization: `Bearer ${moonshotKey}` }
          }).then(async res => ({ ok: res.ok, status: res.status, data: await res.json() }))
      fetches.push(
        p.then((res: any) => {
          if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
          setProviderModels(prev => ({ ...prev, moonshot: res.data.data?.map((m: any) => m.id) ?? [] }))
          setProviderFetchErrors(prev => { const next = { ...prev }; delete next['moonshot']; return next })
        })
        .catch((err: Error) => setProviderFetchErrors(prev => ({ ...prev, moonshot: err.message })))
      )
    }

    const deepseekKey = getKey('DEEPSEEK')
    if (deepseekKey) trackFetch('DeepSeek', 'deepseek',
      'https://api.deepseek.com/v1/models',
      { headers: { Authorization: `Bearer ${deepseekKey}` } },
      (d) => setProviderModels(prev => ({ ...prev, deepseek: d.data?.map((m: any) => m.id) ?? [] }))
    )

    const groqKey = getKey('GROQ')
    if (groqKey) trackFetch('Groq', 'groq',
      'https://api.groq.com/openai/v1/models',
      { headers: { Authorization: `Bearer ${groqKey}` } },
      (d) => setProviderModels(prev => ({ ...prev, groq: d.data?.map((m: any) => m.id) ?? [] }))
    )

    const googleKey = getKey('GOOGLE')
    if (googleKey) trackFetch('Google', 'google',
      `https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey}`,
      {},
      (d) => setProviderModels(prev => ({ ...prev, google: d.models?.map((m: any) => m.name.replace('models/', '')) ?? [] }))
    )

    const orKey = getKey('OPENROUTER')
    if (orKey) trackFetch('OpenRouter', 'openrouter',
      'https://openrouter.ai/api/v1/models',
      { headers: { Authorization: `Bearer ${orKey}` } },
      (d) => {
        if (Array.isArray(d.data)) {
          setProviderModels(prev => ({ ...prev, openrouter: d.data.map((m: any) => m.id) }))
        }
      }
    )

    await Promise.all(fetches)
    setFetchingModels(false)
  }

  const apiKeyProviderKey = secrets
    .filter(s => s.type === 'api_key' && s.provider)
    .map(s => s.provider)
    .sort()
    .join(',')

  useEffect(() => {
    fetchLiveModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeyProviderKey])

  return { providerModels, providerFetchErrors, fetchingModels, fetchLiveModels }
}
