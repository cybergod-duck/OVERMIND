import React from 'react'
import { ChevronDown, Settings } from 'lucide-react'
import { Secret } from '../types/vault'
import { PROVIDER_CONFIG, OPENROUTER_MODELS, CLOUD_MODELS } from '../constants/providers'

interface ModelSelectorProps {
  selectedModel: string
  isOpen: boolean
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  favoriteModels: string[]
  localModels: string[]
  secrets: Secret[]
  providerModels: Record<string, string[]>
  onSelect: (id: string) => void
  onOpenManager: () => void
  getDisplayLabel: (id: string) => string
  containerRef: React.RefObject<HTMLDivElement>
}

export function ModelSelector(props: ModelSelectorProps) {
  const options: { id: string; provider: string; label: string }[] = []
  
  const collect = (id: string, provider: string, label: string) => {
    if (props.favoriteModels.includes(id) || id === props.selectedModel) {
      options.push({ id, provider, label })
    }
  }

  props.localModels.forEach(m => collect(`ollama:${m}`, 'ollama', m))
  
  if (props.secrets.some(s => s.type === 'api_key' && s.provider === 'openrouter')) {
    (props.providerModels['openrouter'] || OPENROUTER_MODELS.map(m => m.route)).forEach(id => {
      collect(`openrouter:${id}`, 'openrouter', id)
    })
  }

  Object.entries(CLOUD_MODELS).forEach(([provider, models]) => {
    if (props.secrets.some(s => s.type === 'api_key' && s.provider === provider)) {
      (props.providerModels[provider] ?? models).forEach(m => {
        collect(`${provider}:${m}`, provider, m)
      })
    }
  })

  const grouped = options.reduce((acc, opt) => {
    if (!acc[opt.provider]) acc[opt.provider] = []
    acc[opt.provider].push(opt)
    return acc
  }, {} as Record<string, typeof options>)

  return (
    <div className="custom-select-container" ref={props.containerRef}>
      <button
        className="model-select-trigger"
        style={{ colorScheme: 'dark' }}
        onClick={() => props.setIsOpen(!props.isOpen)}
      >
        <span className="selected-model-name">{props.getDisplayLabel(props.selectedModel)}</span>
        <ChevronDown size={12} />
      </button>

      {props.isOpen && (
        <div className="custom-select-dropdown">
          <div className="custom-select-list">
            {Object.entries(grouped).map(([provider, opts]) => (
              <div key={provider} className="custom-select-group">
                <div className="custom-select-group-title" style={{ color: PROVIDER_CONFIG[provider]?.color }}>
                  {PROVIDER_CONFIG[provider]?.label || provider.toUpperCase()}
                </div>
                {opts.map(opt => (
                  <div 
                    key={opt.id} 
                    className={`custom-select-option ${opt.id === props.selectedModel ? 'active' : ''}`}
                    onClick={() => props.onSelect(opt.id)}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            ))}
            {options.length === 0 && (
              <div className="custom-select-empty">No favorites. Click Manage.</div>
            )}
          </div>
          <button className="btn-manage-models" onClick={() => { props.onOpenManager(); props.setIsOpen(false); }}>
            <Settings size={12} /> MANAGE MODELS...
          </button>
        </div>
      )}
    </div>
  )
}
