import Color from 'color'
import webColors from 'color-name'
import { Color as VSColor, CancellationToken } from 'vscode-languageserver-protocol'
import { onError, waitImmediate } from './util'

const names = Object.keys(webColors)
const colorHex = /(?<!&|\w)((?:#)([a-f0-9]{6}([a-f0-9]{2})?|[a-f0-9]{3}([a-f0-9]{1})?))\b/gi
const colorFunctions = /(?:\b(rgb|hsl)a?\([\d]{1,3}(\.\d+)?%?,\s*[\d]{1,3}(\.\d+)?%?,\s*[\d]{1,3}(\.\d+)?%?(,\s*\d?\.?\d+)?\))/gi
const colorHwb = /(?:\b(hwb)\(\d+,\s*(100|0*\d{1,2})%,\s*(100|0*\d{1,2})%(,\s*0?\.?\d+)?\))/gi
const colorHexFlutter = /(?<=Color\(\s*0x)(?:[a-fA-F0-9]{1,8})(?=\s*\))/g
const wordRegex = /\b(\w+)\b/gi
const MAX_DURATION = 1000

export interface ColorItem {
  color: VSColor
  /**
   * 0 based character indexes
   */
  span: [number, number]
}

export function findColorHex(line: string, result: ColorItem[]): void {
  colorHex.lastIndex = 0
  findColors(line, colorHex, result)
}

export function findColorFunctions(line: string, result: ColorItem[]): void {
  colorFunctions.lastIndex = 0
  findColors(line, colorFunctions, result)
}

export function findHwb(line: string, result: ColorItem[]): void {
  colorHwb.lastIndex = 0
  findColors(line, colorHwb, result)
}

export function findColorHexFlutter(line: string, result: ColorItem[]): void {
  colorHexFlutter.lastIndex = 0
  let normalizeColorFormat = (colorString: string) => {
    colorString = colorString.padStart(8, "0")
    //alpha bytes are on the opposite end for flutter colors
    let alpha = colorString.slice(0, 2)
    let rgb = colorString.slice(2, 8)
    return "#" + rgb + alpha
  }
  findColors(line, colorHexFlutter, result, normalizeColorFormat)
}

function findColors(line: string, regex: RegExp, result: ColorItem[], normalizeColorFormat?: (color: String) => String): void {
  let match = regex.exec(line)
  while (match != null) {
    const start = match.index
    try {
      if (normalizeColorFormat == undefined) normalizeColorFormat = (colorString) => colorString
      let formattedColor = normalizeColorFormat(match[0].toLowerCase())
      const c = new Color(formattedColor)
      result.push({
        color: { red: c.red() / 255, green: c.green() / 255, blue: c.blue() / 255, alpha: c.alpha() },
        span: [start, start + match[0].length]
      })
    } catch (e) {
      onError(e)
    }
    match = regex.exec(line)
  }
}

export function getNameColor(line: string, result: ColorItem[]): void {
  wordRegex.lastIndex = 0
  let match = wordRegex.exec(line)
  while (match != null) {
    const start = match.index
    try {
      let word = match[0]
      if (names.includes(word)) {
        const c = new Color(word)
        result.push({
          color: { red: c.red() / 255, green: c.green() / 255, blue: c.blue() / 255, alpha: c.alpha() },
          span: [start, start + match[0].length]
        })
      }
    } catch (e) {
      onError(e)
    }
    match = wordRegex.exec(line)
  }
}

/**
 * Color items for each line.
 */
export async function parseColors(lines: ReadonlyArray<string>, colorNamesEnable: boolean, token: CancellationToken): Promise<(readonly ColorItem[])[]> {
  let res: ReadonlyArray<ColorItem>[] = []
  let start = Date.now()
  let prev = Date.now()

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (line.length > 2048) line = line.slice(0, 2048)
    if ((i + 1) % 100 === 0) {
      let curr = Date.now()
      if (curr - prev > 15) {
        await waitImmediate()
        prev = curr
      }
      if (token.isCancellationRequested || curr - start > MAX_DURATION) return
    }
    let curItems: ColorItem[] = []
    if (colorNamesEnable) {
      getNameColor(line, curItems)
    }
    findColorHex(line, curItems)
    findColorFunctions(line, curItems)
    findHwb(line, curItems)
    findColorHexFlutter(line, curItems)
    res.push(curItems)
  }
  return res
}
