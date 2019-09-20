import Color from 'color'
import webColors from 'color-name'
import { Color as VSColor, ColorInformation, Range, TextDocument } from 'vscode-languageserver'

const names = Object.keys(webColors)
const colorHex = /(?<!&|\w)((?:#)([a-f0-9]{6}([a-f0-9]{2})?|[a-f0-9]{3}([a-f0-9]{1})?))\b/gi
const colorFunctions = /(?:\b(rgb|hsl)a?\([\d]{1,3}%?,\s*[\d]{1,3}%?,\s*[\d]{1,3}%?(,\s*\d?\.?\d+)?\))/gi
const colorHwb = /(?:\b(hwb)\(\d+,\s*(100|0*\d{1,2})%,\s*(100|0*\d{1,2})%(,\s*0?\.?\d+)?\))/gi

export function getNameColor(word: string): VSColor | null {
  if (names.indexOf(word) == -1) return null
  let c = new Color(word)
  return { red: c.red() / 255, green: c.green() / 255, blue: c.blue() / 255, alpha: 1 }
}

export function findColorHex(document: TextDocument): ColorInformation[] {
  colorHex.lastIndex = 0
  return findColors(document, colorHex)
}

export function findColorFunctions(document: TextDocument): ColorInformation[] {
  colorFunctions.lastIndex = 0
  return findColors(document, colorFunctions)
}

export function findHwb(document: TextDocument): ColorInformation[] {
  colorHwb.lastIndex = 0
  return findColors(document, colorHwb)
}

function findColors(document: TextDocument, regex: RegExp): ColorInformation[] {
  let text = document.getText()
  let match = regex.exec(text)
  let result: ColorInformation[] = []
  while (match !== null) {
    const start = match.index
    try {
      const c = new Color(match[0].toLowerCase())
      result.push({
        color: { red: c.red() / 255, green: c.green() / 255, blue: c.blue() / 255, alpha: c.alpha() },
        range: Range.create(document.positionAt(start), document.positionAt(start + match[0].length))
      })
    } catch (e) {
      // noop
      console.error(e.stack)
    }
    match = regex.exec(text)
  }
  return result
}
