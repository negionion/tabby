/** Opens a link from an answer; called only for http(s) URLs */
export type OpenLink = (url: string) => void

/** Only the code block under the "Suggested commands" heading is treated as commands */
export function extractSuggestedCommands (text: string): { commands: string[], rest: string } {
    const match = /(^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?Suggested commands(?:\*\*)?:?[ \t]*\r?\n(?:[ \t]*\r?\n)*[ \t]*```[^\n]*\n([\s\S]*?)```/i.exec(text)
    if (!match) {
        return { commands: [], rest: text }
    }
    // Control characters (a lone \r, ESC) are removed: they would run extra commands or hide text in the terminal
    const commands = match[2].split(/\r\n?|\n/)
        .map(line => line.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim())
        .filter(line => line && !line.startsWith('#'))
    return { commands, rest: `${text.slice(0, match.index)}${match[1]}${text.slice(match.index + match[0].length)}`.trimEnd() }
}

export function renderInline (parent: HTMLElement, text: string, openLink: OpenLink): void {
    let buffer = ''
    const flush = () => {
        if (buffer) {
            parent.appendChild(document.createTextNode(buffer))
            buffer = ''
        }
    }
    let index = 0
    while (index < text.length) {
        const rest = text.slice(index)
        const code = /^(`+)([\s\S]+?)\1(?!`)/.exec(rest)
        if (code) {
            flush()
            const element = document.createElement('code')
            element.textContent = code[2].trim() || code[2]
            parent.appendChild(element)
            index += code[0].length
            continue
        }
        const strong = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest)
        if (strong) {
            flush()
            const element = document.createElement('strong')
            renderInline(element, strong[2], openLink)
            parent.appendChild(element)
            index += strong[0].length
            continue
        }
        // "_" only starts emphasis at a word boundary, so snake_case names stay literal
        const em = /^\*(?=\S)([^*]+?\S|\S)\*(?!\*)/.exec(rest) ?? (index === 0 || !/\w/.test(text[index - 1]) ? /^_(?=\S)([^_]+?\S|\S)_(?!\w)/.exec(rest) : null)
        if (em) {
            flush()
            const element = document.createElement('em')
            renderInline(element, em[1], openLink)
            parent.appendChild(element)
            index += em[0].length
            continue
        }
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
        if (link) {
            flush()
            const anchor = document.createElement('a')
            anchor.className = 'ai-md-link'
            anchor.textContent = link[1]
            const url = link[2]
            anchor.title = url
            anchor.href = '#'
            anchor.addEventListener('click', event => {
                event.preventDefault()
                // Only open web links, externally
                if (/^https?:\/\//i.test(url)) {
                    openLink(url)
                }
            })
            parent.appendChild(anchor)
            index += link[0].length
            continue
        }
        buffer += text[index]
        index++
    }
    flush()
}

type Inline = (parent: HTMLElement, value: string) => void

interface OpenList {
    indent: number
    ordered: boolean
    element: HTMLElement
}

const FENCE = /^\s*```/
const TABLE_ROW = /^\s*\|.*\|\s*$/

/** The fenced code block opened at lines[start]; end is the index of its closing fence */
function readCodeBlock (lines: string[], start: number): { element: HTMLElement, end: number } {
    const body: string[] = []
    let index = start + 1
    while (index < lines.length && !FENCE.test(lines[index])) {
        body.push(lines[index])
        index++
    }
    const pre = document.createElement('pre')
    pre.className = 'ai-md-code'
    pre.textContent = body.join('\n')
    return { element: pre, end: index }
}

/** The table starting at lines[start] (the |---| separator row is skipped); end is its last row */
function readTable (lines: string[], start: number, inline: Inline): { element: HTMLElement, end: number } {
    const table = document.createElement('table')
    table.className = 'ai-md-table'
    let header = true
    let index = start
    while (index < lines.length && TABLE_ROW.test(lines[index])) {
        const cells = lines[index].trim().slice(1, -1).split('|').map(cell => cell.trim())
        index++
        if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) {
            continue
        }
        const tr = document.createElement('tr')
        for (const cell of cells) {
            const td = document.createElement(header ? 'th' : 'td')
            inline(td, cell)
            tr.appendChild(td)
        }
        table.appendChild(tr)
        header = false
    }
    const wrap = document.createElement('div')
    wrap.className = 'ai-md-table-wrap'
    wrap.appendChild(table)
    return { element: wrap, end: index - 1 }
}

/** Adds a list item, opening a nested list or closing lists as the indentation changes */
function addListItem (lists: OpenList[], container: HTMLElement, item: RegExpExecArray, inline: Inline): void {
    const indent = item[1].replace(/\t/g, '    ').length
    const ordered = /\d/.test(item[2])
    while (lists.length && indent < lists[lists.length - 1].indent) {
        lists.pop()
    }
    let top = lists[lists.length - 1] as OpenList|undefined
    if (!top || indent > top.indent || top.ordered !== ordered) {
        if (top && indent === top.indent) {
            lists.pop()
        }
        const parentList = lists[lists.length - 1] as OpenList|undefined
        const element = document.createElement(ordered ? 'ol' : 'ul')
        const host = parentList?.element.lastElementChild ?? container
        host.appendChild(element)
        top = { indent, ordered, element }
        lists.push(top)
    }
    const li = document.createElement('li')
    inline(li, item[3])
    top.element.appendChild(li)
}

/**
 * Small markdown renderer for answers: headings, paragraphs, nested lists, blockquotes, rules,
 * tables, fenced code and inline code / bold / italic / links. Text is always set via textContent.
 */
export function renderMarkdown (text: string, openLink: OpenLink): HTMLElement {
    const inline: Inline = (parent, value) => renderInline(parent, value, openLink)
    const root = document.createElement('div')
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    let paragraph: string[] = []
    const lists: OpenList[] = []
    let quote: HTMLElement|null = null
    const container = () => quote ?? root
    const flushParagraph = () => {
        if (paragraph.length) {
            const p = document.createElement('p')
            paragraph.forEach((line, index) => {
                if (index) {
                    p.appendChild(document.createElement('br'))
                }
                inline(p, line)
            })
            container().appendChild(p)
            paragraph = []
        }
    }
    const closeLists = () => {
        lists.length = 0
    }
    for (let index = 0; index < lines.length; index++) {
        let line = lines[index]
        const quoted = /^\s*>\s?(.*)$/.exec(line)
        if (quoted) {
            if (!quote) {
                flushParagraph()
                closeLists()
                quote = document.createElement('blockquote')
                root.appendChild(quote)
            }
            line = quoted[1]
        } else if (quote) {
            flushParagraph()
            closeLists()
            quote = null
        }
        if (FENCE.test(line) || TABLE_ROW.test(line)) {
            flushParagraph()
            closeLists()
            const block = FENCE.test(line) ? readCodeBlock(lines, index) : readTable(lines, index, inline)
            container().appendChild(block.element)
            index = block.end
            continue
        }
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
            flushParagraph()
            closeLists()
            container().appendChild(document.createElement('hr'))
            continue
        }
        const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
            flushParagraph()
            closeLists()
            const h = document.createElement('div')
            h.className = `ai-md-heading ai-md-h${heading[1].length}`
            inline(h, heading[2].replace(/\s+#+\s*$/, ''))
            container().appendChild(h)
            continue
        }
        const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
        if (item) {
            flushParagraph()
            addListItem(lists, container(), item, inline)
            continue
        }
        if (!line.trim()) {
            flushParagraph()
            closeLists()
            continue
        }
        if (lists.length && /^\s{2,}\S/.test(line)) {
            const lastItem = lists[lists.length - 1].element.lastElementChild as HTMLElement|null
            if (lastItem) {
                lastItem.appendChild(document.createElement('br'))
                inline(lastItem, line.trim())
                continue
            }
        }
        closeLists()
        paragraph.push(line)
    }
    flushParagraph()
    return root
}
