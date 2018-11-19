import { TextDocument, ColorInformation } from 'vscode-languageserver'
import { DocumentSymbol } from './types'
import { findColorFunctions, findHwb, findColorHex, getNameColor } from "./matchers"

export function parseDocumentColors(document: TextDocument, symbols: DocumentSymbol[]): ColorInformation[] {
  let res: ColorInformation[] = []
  symbols.forEach(o => {
    let color = getNameColor(o.text)
    if (color) {
      res.push({ color, range: o.range })
    }
  })
  res.push(...findColorHex(document))
  res.push(...findColorFunctions(document))
  res.push(...findHwb(document))
  return res
}
