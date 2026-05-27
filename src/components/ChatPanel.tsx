import React, { useState } from 'react'
import { Message } from '../types/vault'
import { Plus, Send, ImageIcon, Download, X } from 'lucide-react'

interface ChatPanelProps {
  messages: Message[]
  loading: boolean
  elapsedTime: number
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  onSendMessage: () => void
  onAttachFile: () => void
  onGenerateImage?: (prompt: string) => void
  chatRef: React.RefObject<HTMLDivElement>
}

export function ChatPanel(props: ChatPanelProps) {
  const [showImageInput, setShowImageInput] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')

  const handleSend = () => {
    if (props.loading || !props.input.trim()) return
    // Check for /image command
    const trimmed = props.input.trim()
    if (trimmed.startsWith('/image ') && props.onGenerateImage) {
      const prompt = trimmed.slice(7).trim()
      if (prompt) {
        props.setInput('')
        props.onGenerateImage(prompt)
      }
      return
    }
    props.onSendMessage()
  }

  const handleImageGenerateClick = () => {
    if (showImageInput && imagePrompt.trim() && props.onGenerateImage) {
      props.onGenerateImage(imagePrompt.trim())
      setImagePrompt('')
      setShowImageInput(false)
    } else {
      setShowImageInput(!showImageInput)
    }
  }

  const handleDownload = async (imageUrl: string, prompt: string) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeName = prompt.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')
      a.download = `overmind-${safeName}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      // If direct download fails, open in new tab
      window.open(imageUrl, '_blank')
    }
  }

  return (
    <div className="content">
      <div className="chat" ref={props.chatRef}>
        {props.messages.length === 0 ? (
          <div className="empty-state">
            <div className="hero-logo">
              <img src="../../assets/icon.png" alt="Overmind" draggable={false} />
            </div>
            <div className="empty-logo-text">Overmind</div>
            <div className="empty-tagline">Personal AI For Your PC</div>
          </div>
        ) : (
          props.messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`}>
              {m.role === 'assistant' && <div className="msg-avatar">◆</div>}
              <div className="msg-body">
                {m.role !== 'user' && (
                  <div className="msg-role-label">
                    {m.role === 'assistant' ? 'Overmind' : m.role.toUpperCase()}
                  </div>
                )}
                {m.imageUrl ? (
                  <div className="msg-image-card">
                    <div className="msg-image-prompt">{m.imagePrompt || 'Generated Image'}</div>
                    <div className="msg-image-wrapper">
                      <img
                        src={m.imageUrl}
                        alt={m.imagePrompt || 'Generated image'}
                        className="msg-image"
                        draggable={false}
                      />
                    </div>
                    <button
                      className="msg-image-download"
                      onClick={() => handleDownload(m.imageUrl!, m.imagePrompt || 'image')}
                      title="Download image"
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </div>
                ) : (
                  <div className="msg-content">{m.content}</div>
                )}
              </div>
            </div>
          ))
        )}
        {props.loading && (
          <div className="thinking-indicator-simple">
            <span className="thinking-icon">◆</span>
            <span className="thinking-text">Thinking {(props.elapsedTime / 1000).toFixed(1)}s</span>
          </div>
        )}
      </div>

      <div className="input-bar">
        <div className="input-container">
          <button className="btn-attach" title="Attach file" onClick={props.onAttachFile}>
            <Plus size={16} />
          </button>
          {showImageInput ? (
            <div className="image-input-row">
              <input
                className="image-input-field"
                type="text"
                value={imagePrompt}
                onChange={e => setImagePrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (imagePrompt.trim() && props.onGenerateImage) {
                      props.onGenerateImage(imagePrompt.trim())
                      setImagePrompt('')
                      setShowImageInput(false)
                    }
                  }
                  if (e.key === 'Escape') {
                    setShowImageInput(false)
                    setImagePrompt('')
                  }
                }}
                placeholder="Describe the image to generate..."
                autoFocus
              />
              <button
                className="btn-image-cancel"
                onClick={() => { setShowImageInput(false); setImagePrompt('') }}
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <textarea
              className="input-field"
              value={props.input}
              onChange={e => props.setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Message Overmind... (type /image to generate)"
              disabled={props.loading}
              rows={1}
            />
          )}
          <button
            className="btn-image-gen"
            onClick={handleImageGenerateClick}
            disabled={props.loading}
            title={showImageInput ? 'Generate image' : 'Generate image'}
          >
            <ImageIcon size={16} />
          </button>
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={props.loading || (!props.input.trim() && !showImageInput)}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
