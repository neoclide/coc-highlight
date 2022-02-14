import { TextDocument, ColorInformation } from 'vscode-languageserver'
import { DocumentSymbol } from './types'
import { findColorFunctions, findHwb, findColorHex, getNameColor, findColorHexFlutter } from "./matchers"
import { settings } from '.';

export function parseDocumentColors(document: TextDocument, symbols: DocumentSymbol[]): ColorInformation[] {
  let res: ColorInformation[] = []
  if (settings.colorNamesEnable) {
    symbols.forEach(o => {
      let color = getNameColor(o.text)
      if (color) {
        res.push({ color, range: o.range })
      }
    })
  }
  res.push(...findColorHex(document))
  res.push(...findColorFunctions(document))
  res.push(...findHwb(document))
  res.push(...findColorHexFlutter(document))
  return res
}
