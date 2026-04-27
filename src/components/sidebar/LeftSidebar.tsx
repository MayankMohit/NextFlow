'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, Type, Image, Video, Brain, Crop, Film, LogOut } from 'lucide-react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useWorkflowStore } from '@/store/workflowStore'

const nodeButtons = [
  { label: 'Text', icon: Type, type: 'textNode', description: 'Input text / prompt' },
  { label: 'Upload Image', icon: Image, type: 'uploadImageNode', description: 'Upload jpg/png/webp' },
  { label: 'Upload Video', icon: Video, type: 'uploadVideoNode', description: 'Upload mp4/webm' },
  { label: 'LLM', icon: Brain, type: 'llmNode', description: 'Run Gemini AI model' },
  { label: 'Crop Image', icon: Crop, type: 'cropImageNode', description: 'Crop with FFmpeg' },
  { label: 'Extract Frame', icon: Film, type: 'extractFrameNode', description: 'Extract video frame' },
]

const MIN_WIDTH = 48
const MAX_WIDTH = 320
const DEFAULT_WIDTH = 240
const COLLAPSE_THRESHOLD = 80

function generateUsername(user: ReturnType<typeof useUser>['user']): string {
  if (user?.username) return user.username
  if (user?.firstName) {
    const initial = user.firstName[0].toUpperCase()
    const random = Math.random().toString(36).slice(2, 6)
    return `${initial}_${random}`
  }
  if (user?.emailAddresses?.[0]?.emailAddress) return user.emailAddresses[0].emailAddress.split('@')[0]
  return `user_${Math.random().toString(36).slice(2, 8)}`
}

const getInitialData = (type: string) => {
  switch (type) {
    case 'textNode': return { label: 'Text', text: '', status: 'idle' }
    case 'uploadImageNode': return { label: 'Upload Image', imageUrl: null, status: 'idle' }
    case 'uploadVideoNode': return { label: 'Upload Video', videoUrl: null, status: 'idle' }
    case 'llmNode': return { label: 'LLM', model: 'gemini-3.1-flash-lite-preview', result: null, status: 'idle' }
    case 'cropImageNode': return { label: 'Crop Image', xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100, status: 'idle' }
    case 'extractFrameNode': return { label: 'Extract Frame', timestamp: '0', status: 'idle' }
    default: return { label: type, status: 'idle' }
  }
}

export default function LeftSidebar() {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)

  const { addNode, theme } = useWorkflowStore()
  const { user } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()

  const isDark = theme === 'dark'
  const username = user ? generateUsername(user) : '...'
  const initial = username[0].toUpperCase()

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const delta = e.clientX - startX.current
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
    setWidth(newWidth)
    setCollapsed(newWidth < COLLAPSE_THRESHOLD)
  }, [])

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (width < COLLAPSE_THRESHOLD) { setWidth(MIN_WIDTH); setCollapsed(true) }
  }, [width])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [onMouseMove, onMouseUp])

  const filtered = nodeButtons.filter(n => n.label.toLowerCase().includes(search.toLowerCase()))

  const handleSignOut = async () => { await signOut(); router.push('/sign-in') }

  const handleAddNode = (type: string) => {
    addNode({
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 200 + Math.random() * 200, y: 150 + Math.random() * 200 },
      data: getInitialData(type),
    } as never)
  }

  const onDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/reactflow', type)
    e.dataTransfer.effectAllowed = 'move'
  }

  const bg = isDark ? 'bg-[#141414]' : 'bg-[#f0f0f0]'
  const border = isDark ? 'border-[#2a2a2a]' : 'border-[#d4d4d4]'
  const textMuted = isDark ? 'text-[#666]' : 'text-[#999]'
  const textMain = isDark ? 'text-white' : 'text-[#111]'
  const hover = isDark ? 'hover:bg-[#2a2a2a]' : 'hover:bg-[#e0e0e0]'
  const inputBg = isDark ? 'bg-[#1c1c1c]' : 'bg-white'

  return (
    <div
      style={{ width: `${width}px` }}
      className={`relative h-full ${bg} border-r ${border} flex flex-col shrink-0 transition-none z-20`}
    >
      {/* Logo */}
      <div className={`p-3 border-b ${border} flex items-center gap-2 overflow-hidden`}>
        <div className="w-5 h-5 rounded bg-violet-600 shrink-0" />
        {!collapsed && <span className={`${textMain} font-semibold text-sm truncate`}>NextFlow</span>}
      </div>

      {!collapsed && (
        <>
          {/* Search */}
          <div className={`p-3 border-b ${border}`}>
            <div className={`flex items-center gap-2 ${inputBg} rounded px-2 py-1.5 border ${border}`}>
              <Search size={13} className={`${textMuted} shrink-0`} />
              <input
                type="text"
                placeholder="Search nodes..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`bg-transparent ${textMain} text-xs outline-none w-full placeholder:${textMuted}`}
              />
            </div>
          </div>

          {/* Quick Access */}
          <div className="p-3 flex-1 overflow-y-auto">
            <p className={`${textMuted} text-xs mb-2 uppercase tracking-wider font-medium`}>Quick Access</p>
            <div className="flex flex-col gap-0.5">
              {filtered.map(node => (
                <button
                  key={node.type}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg ${hover} ${textMain} text-xs w-full text-left transition-colors cursor-grab active:cursor-grabbing group`}
                  onClick={() => handleAddNode(node.type)}
                  draggable
                  onDragStart={e => onDragStart(e, node.type)}
                  title={`${node.description} — drag to canvas or click to add`}
                >
                  <node.icon size={14} className="text-violet-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">{node.label}</span>
                    <span className={`${textMuted} text-[10px] truncate`}>{node.description}</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className={`${textMuted} text-xs text-center py-4`}>No nodes found</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Collapsed icon-only */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 p-2 mt-3 flex-1">
          {nodeButtons.map(node => (
            <button
              key={node.type}
              title={node.label}
              draggable
              onDragStart={e => onDragStart(e, node.type)}
              onClick={() => handleAddNode(node.type)}
              className={`text-violet-400 transition-colors cursor-grab active:cursor-grabbing p-1.5 rounded ${isDark ? 'hover:bg-[#2a2a2a] hover:text-white' : 'hover:bg-[#e0e0e0]'}`}
            >
              <node.icon size={16} />
            </button>
          ))}
        </div>
      )}

      {/* User section */}
      <div className={`border-t ${border} p-2`}>
        <button
          onClick={() => setUserMenuOpen(v => !v)}
          className={`flex items-center gap-2 w-full rounded-lg ${hover} p-1.5 transition-colors`}
        >
          <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initial}
          </div>
          {!collapsed && <span className={`${textMain} text-xs truncate`}>{username}</span>}
        </button>
        {userMenuOpen && (
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-2 py-1.5 mt-1 rounded-lg hover:bg-red-500/20 text-red-400 text-xs transition-colors"
          >
            <LogOut size={13} />
            {!collapsed && <span>Sign out</span>}
          </button>
        )}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-violet-600/40 transition-colors z-30"
      />
    </div>
  )
}