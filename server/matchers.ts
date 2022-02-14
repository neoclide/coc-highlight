import Color from 'color'
import webColors from 'color-name'
import { Color as VSColor, ColorInformation, Range, TextDocument } from 'vscode-languageserver'

const names = Object.keys(webColors)
const colorHex = /(?<!&|\w)((?:#)([a-f0-9]{6}([a-f0-9]{2})?|[a-f0-9]{3}([a-f0-9]{1})?))\b/gi
const colorFunctions = /(?:\b(rgb|hsl)a?\([\d]{1,3}(\.\d+)?%?,\s*[\d]{1,3}(\.\d+)?%?,\s*[\d]{1,3}(\.\d+)?%?(,\s*\d?\.?\d+)?\))/gi
const colorHwb = /(?:\b(hwb)\(\d+,\s*(100|0*\d{1,2})%,\s*(100|0*\d{1,2})%(,\s*0?\.?\d+)?\))/gi
const colorHexFlutter= /(?<=Color\(\s*0x)(?:[a-fA-F0-9]{1,8})(?=\s*\))/g

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

export function findColorHexFlutter(document: TextDocument): ColorInformation[] {
    colorHexFlutter.lastIndex = 0;
    let normalizeColorFormat = (colorString: String) => {
        colorString = colorString.padStart(8, "0")
        //alpha bytes are on the opposite end for flutter colors
        let alpha = colorString.slice(0, 2)
        let rgb = colorString.slice(2, 8)
        return "#" + rgb + alpha
    };
    return findColors(document, colorHexFlutter, normalizeColorFormat);
}

function findColors(document: TextDocument, regex: RegExp, normalizeColorFormat?: (color: String) => String) : ColorInformation[] {
  let text = document.getText()
  let match = regex.exec(text)
  let result: ColorInformation[] = []
  while (match !== null) {
    const start = match.index
    try {
      if (normalizeColorFormat == undefined) 
          normalizeColorFormat = (colorString) => colorString
      let formattedColor = normalizeColorFormat(match[0].toLowerCase())
      const c = new Color(formattedColor)
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
