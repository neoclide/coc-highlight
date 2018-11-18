import Color from 'color'
import webColors from 'color-name'
import { Color as VSColor, ColorInformation, Range, TextDocument } from 'vscode-languageserver'

const names = Object.keys(webColors)
const colorHex = /^.?((?:\#|\b0x)([a-f0-9]{6}([a-f0-9]{2})?|[a-f0-9]{3}([a-f0-9]{1})?))\b$/gi
const colorFunctions = /((rgb|hsl)a?\([\d]{1,3}%?,\s*[\d]{1,3}%?,\s*[\d]{1,3}%?(,\s*\d?\.?\d+)?\))/gi
const colorHwb = /((hwb)\(\d+,\s*(100|0*\d{1,2})%,\s*(100|0*\d{1,2})%(,\s*0?\.?\d+)?\))/gi

export function getHexColor(word: string): VSColor | null {
  if (!word.startsWith('#')) return null
  if (!colorHex.test(word)) return null
  let c = new Color(word)
  return { red: c.red() / 255, green: c.green() / 255, blue: c.blue() / 255, alpha: 1 }
}

export function getNameColor(word: string): VSColor | null {
  if (names.indexOf(word) == -1) return null
  let c = new Color(word)
  return { red: c.red() / 255, green: c.green() / 255, blue: c.blue() / 255, alpha: 1 }
}

export function findColorFunctions(document: TextDocument): ColorInformation[] {
  let content = document.getText()
  let match = colorFunctions.exec(content)
  let result: ColorInformation[] = []

  while (match !== null) {
    const start = match.index
    const c = new Color(match[0])

    result.push({
      color: { red: c.red() / 255, green: c.green() / 255, blue: c.blue() / 255, alpha: c.alpha() },
      range: Range.create(document.positionAt(start), document.positionAt(start + match[0].length))
    })

    match = colorFunctions.exec(content)
  }

  return result
}

export function findHwb(document: TextDocument): ColorInformation[] {
  let text = document.getText()
  let match = colorHwb.exec(text)
  let result: ColorInformation[] = []

  while (match !== null) {
    const start = match.index
    const matchedColor = match[0]
    let result: ColorInformation[] = []

    try {
      const c = Color(matchedColor)
      result.push({
        color: { red: c.red() / 255, green: c.green() / 255, blue: c.blue() / 255, alpha: c.alpha() },
        range: Range.create(document.positionAt(start), document.positionAt(start + match[0].length))
      })
    } catch (e) {
      // noop
    }
    match = colorHwb.exec(text)
  }
  return result
}
