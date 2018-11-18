import { DocumentSymbol } from './types'
import { Range, TextDocument } from 'vscode-languageserver'

export class CharRange {
  public start: number
  public end: number
  constructor(start: number, end?: number) {
    this.start = start
    this.end = end ? end : start
  }

  public static fromKeywordOption(keywordOption: string): CharRange[] {
    let parts = keywordOption.split(',')
    let ranges: CharRange[] = []
    for (let part of parts) {
      if (part == '@') {
        // isalpha() of c
        ranges.push(new CharRange(65, 90))
        ranges.push(new CharRange(97, 122))
        ranges.push(new CharRange(192, 255))
      } else if (part == '@-@') {
        ranges.push(new CharRange(64))
      } else if (/^([A-Za-z])-([A-Za-z])$/.test(part)) {
        let ms = part.match(/^([A-Za-z])-([A-Za-z])$/)
        ranges.push(new CharRange(ms[1].charCodeAt(0), ms[2].charCodeAt(0)))
      } else if (/^\d+-\d+$/.test(part)) {
        let ms = part.match(/^(\d+)-(\d+)$/)
        ranges.push(new CharRange(Number(ms[1]), Number(ms[2])))
      } else if (/^\d+$/.test(part)) {
        ranges.push(new CharRange(Number(part)))
      } else {
        let c = part.charCodeAt(0)
        if (!ranges.some(o => o.contains(c))) {
          ranges.push(new CharRange(c))
        }
      }
    }
    return ranges
  }

  public contains(c: number): boolean {
    return c >= this.start && c <= this.end
  }
}

export class Chars {
  public ranges: CharRange[] = []
  constructor(keywordOption?: string) {
    if (keywordOption) this.ranges = CharRange.fromKeywordOption(keywordOption)
  }

  public setKeywordOption(keywordOption: string): void {
    this.ranges = CharRange.fromKeywordOption(keywordOption)
  }

  public matchSymbols(document: TextDocument): DocumentSymbol[] {
    let content = document.getText()
    if (!content) return []
    let res: DocumentSymbol[] = []
    content = content + '\n'
    let str = ''
    for (let i = 0, l = content.length; i < l; i++) {
      let ch = content[i]
      if ('-' == ch && str.length == 0) {
        continue
      }
      let isKeyword = this.isKeywordChar(ch)
      if (isKeyword) {
        str = str + ch
      }
      if (str.length > 0 && !isKeyword) {
        res.push({
          text: str,
          range: Range.create(document.positionAt(i - str.length), document.positionAt(i))
        })
      }
      if (!isKeyword) {
        str = ''
      }
    }
    return res
  }

  public isKeywordChar(ch: string): boolean {
    let { ranges } = this
    let c = ch.charCodeAt(0)
    if (c > 255) return false
    return ranges.some(r => r.contains(c))
  }
}
