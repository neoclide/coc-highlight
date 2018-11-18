import { TextDocument, ColorInformation } from 'vscode-languageserver'
import { DocumentSymbol } from './types'
import { findColorFunctions, findHwb, getHexColor, getNameColor } from "./matchers"

export function parseDocumentColors(document: TextDocument, symbols: DocumentSymbol[]): ColorInformation[] {
  let res: ColorInformation[] = []
  symbols.forEach(o => {
    let color = getHexColor(o.text) || getNameColor(o.text)
    if (color) {
      res.push({ color, range: o.range })
    }
  })
  res.push(...findColorFunctions(document))
  res.push(...findHwb(document))
  return res
}
