import { Color } from 'coc.nvim'
import { Worker } from 'worker_threads'

export interface Settings {
  trace: 'off' | 'messages' | 'verbose'
  highlightEnable: boolean
  colorsEnable: boolean
  colorNamesEnable: boolean
  disableLanguages: string[]
}

export interface ColorItem {
  color: Color
  /**
   * 0 based character indexes
   */
  span: [number, number]
}

export interface WorkerItem {
  busy: boolean
  bufnr?: number
  worker: Worker
}

