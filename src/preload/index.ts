import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'
import type { Result } from '../shared/types'

/** Result 形式を解いて、失敗時は例外にする */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  if (!r.ok) throw new Error(r.error ?? '不明なエラー')
  return r.value as T
}

const api: Api = {
  getSettings: () => call('settings:get'),
  updateSettings: (patch) => call('settings:update', patch),
  setApiKey: (provider, key) => call('settings:setKey', provider, key),
  refreshModels: (provider) => call('settings:refreshModels', provider),
  pickFolder: () => call('dialog:pickFolder'),

  listFolder: (dir) => call('library:list', dir),
  readSet: (dir) => call('library:readSet', dir),
  createFolder: (parent, name) => call('library:createFolder', parent, name),
  trash: (path) => call('library:trash', path),
  updateSet: (dir, set) => call('library:updateSet', dir, set),
  readFigure: (dir, index) => call('library:readFigure', dir, index),
  listReferences: (dir) => call('library:references', dir),
  openPath: (path) => call('shell:openPath', path),
  brushupFigure: (dir, index, instruction, modelKey, requestId) =>
    call('figure:brushup', dir, index, instruction, modelKey, requestId),
  updateFigure: (dir, index, code) => call('figure:update', dir, index, code),
  undoFigure: (dir, index) => call('figure:undo', dir, index),
  reveal: (path) => call('shell:reveal', path),
  openTex: (dir, which) => call('shell:openTex', dir, which),

  generate: (req, requestId) => call('generate:run', req, requestId),
  cancel: (requestId) => call('request:cancel', requestId),
  onGenerateProgress: (cb) => {
    const l = (_: unknown, id: string, text: string): void => cb(id, text)
    ipcRenderer.on('generate:progress', l)
    return () => ipcRenderer.removeListener('generate:progress', l)
  },

  loadChat: (dir) => call('chat:load', dir),
  saveChat: (dir, messages) => call('chat:save', dir, messages),
  sendChat: (dir, focusSet, messages, modelKey, requestId) =>
    call('chat:send', dir, focusSet, messages, modelKey, requestId),
  onChatDelta: (cb) => {
    const l = (_: unknown, id: string, delta: string): void => cb(id, delta)
    ipcRenderer.on('chat:delta', l)
    return () => ipcRenderer.removeListener('chat:delta', l)
  },

  setTheme: (mode) => ipcRenderer.send('theme:set', mode)
}

contextBridge.exposeInMainWorld('api', api)
