/** Saved sender tags: their data, groups, group colors and {{name}} placeholders. No DOM state. */

export interface SavedSenderCommand {
    name?: string
    command: string
    group?: string
}

export const MAX_SAVED_SENDER_COMMANDS = 100
/** senderGroupFilter value that shows the tags without a group */
export const UNGROUPED_FILTER = '__ungrouped__'
/** Group colors that read well on the dark panel; a group without a chosen color gets one from its name */
export const GROUP_COLORS: Record<string, { label: string, hex: string }> = {
    amber: { label: 'Amber', hex: '#ffc75e' },
    blue: { label: 'Blue', hex: '#6cb6ff' },
    green: { label: 'Green', hex: '#7ee787' },
    purple: { label: 'Purple', hex: '#c297ff' },
    pink: { label: 'Pink', hex: '#ff8fc8' },
    teal: { label: 'Teal', hex: '#5fd4d4' },
    red: { label: 'Red', hex: '#ff7b72' },
    gray: { label: 'Gray', hex: '#a9b4c0' },
}
const AUTO_GROUP_COLORS = ['amber', 'blue', 'green', 'purple', 'pink', 'teal', 'red']
export const ALL_GROUPS_COLOR = '#a9bed1'

const VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g

export function normalizeGroupName (value: string): string|undefined {
    const name = Array.from(value.trim()).slice(0, 40).join('').trim()
    return name && name !== UNGROUPED_FILTER ? name : undefined
}

function hashGroupName (group: string): number {
    let hash = 0
    for (const char of group) {
        hash = hash * 31 + (char.codePointAt(0) ?? 0) >>> 0
    }
    return hash
}

/** Valid tags from the config value, at most MAX_SAVED_SENDER_COMMANDS */
export function normalizeSavedCommands (savedCommands: unknown): SavedSenderCommand[] {
    if (!Array.isArray(savedCommands)) {
        return []
    }

    return savedCommands
        .filter((item: any) => item && typeof item.command === 'string' && item.command.trim())
        .map((item: any) => {
            const command: SavedSenderCommand = {
                name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined,
                command: item.command.trim(),
            }
            const group = typeof item.group === 'string' ? normalizeGroupName(item.group) : undefined
            if (group) {
                command.group = group
            }
            return command
        })
        .slice(-MAX_SAVED_SENDER_COMMANDS)
}

/** Groups in the order their first tag appears */
export function getSavedGroups (commands: SavedSenderCommand[]): string[] {
    return [...new Set(commands.map(item => item.group).filter((group): group is string => Boolean(group)))]
}

export function matchesGroupFilter (item: SavedSenderCommand, filter: string): boolean {
    if (!filter) {
        return true
    }
    return filter === UNGROUPED_FILTER ? !item.group : item.group === filter
}

/** Index right after the last tag of the group; ungrouped tags go to the end */
export function getGroupEndIndex (commands: SavedSenderCommand[], group: string|undefined): number {
    if (!group) {
        return commands.length
    }
    for (let index = commands.length - 1; index >= 0; index--) {
        if (commands[index].group === group) {
            return index + 1
        }
    }
    return commands.length
}

export function buildSavedCommandLabel (value: string): string {
    const firstLine = value.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? 'Command'
    const characters = Array.from(firstLine)
    return characters.length > 16 ? `${characters.slice(0, 16).join('')}...` : firstLine
}

/** A palette name or a custom #rrggbb color chosen for the group, from the senderGroupColors config */
export function chosenGroupColor (colors: Record<string, unknown>|undefined, group: string): string|null {
    const chosen = colors?.[group]
    if (typeof chosen !== 'string') {
        return null
    }
    return chosen in GROUP_COLORS || /^#[0-9a-f]{6}$/i.test(chosen) ? chosen : null
}

/**
 * Automatic colors avoid the colors already in use: groups are taken in name order (not display order,
 * so dragging does not recolor them), each gets its name-based color or the next free one.
 */
export function automaticGroupColors (groups: string[], colors: Record<string, unknown>|undefined): Map<string, string> {
    const used = new Set(groups.map(group => chosenGroupColor(colors, group)).filter((color): color is string => !!color))
    const automatic = new Map<string, string>()
    for (const group of [...groups].sort()) {
        if (chosenGroupColor(colors, group)) {
            continue
        }
        const start = hashGroupName(group) % AUTO_GROUP_COLORS.length
        const free = AUTO_GROUP_COLORS.map((_, offset) => AUTO_GROUP_COLORS[(start + offset) % AUTO_GROUP_COLORS.length]).find(key => !used.has(key))
        const key = free ?? AUTO_GROUP_COLORS[start]
        used.add(key)
        automatic.set(group, GROUP_COLORS[key].hex)
    }
    return automatic
}

/** The #rrggbb color of the group: chosen, else automatic */
export function groupColorHex (group: string, colors: Record<string, unknown>|undefined, automatic: Map<string, string>): string {
    const chosen = chosenGroupColor(colors, group)
    if (chosen) {
        return chosen.startsWith('#') ? chosen.toLowerCase() : GROUP_COLORS[chosen].hex
    }
    return automatic.get(group) ?? GROUP_COLORS[AUTO_GROUP_COLORS[hashGroupName(group) % AUTO_GROUP_COLORS.length]].hex
}

/** senderGroupColors with the color of one group set (or removed with null) */
export function withGroupColor (colors: Record<string, unknown>|undefined, group: string, color: string|null): Record<string, string> {
    const entries = Object.entries(colors ?? {}).filter(([name]) => name !== group)
    if (color) {
        entries.push([group, color])
    }
    return Object.fromEntries(entries) as Record<string, string>
}

/** Sets the color, its translucent border / hover tints and a readable text color for the filled chip */
export function applyGroupColor (element: HTMLElement, hex: string): void {
    const [red, green, blue] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
    // A dark custom color is lightened for text and bars, which sit on the dark panel background
    const accent = luminance < 0.4
        ? `rgb(${[red, green, blue].map(value => Math.round(value + (255 - value) * 0.55)).join(', ')})`
        : hex
    element.style.setProperty('--ai-group-color', hex)
    element.style.setProperty('--ai-group-accent', accent)
    element.style.setProperty('--ai-group-border', luminance < 0.4 ? accent : `rgba(${red}, ${green}, ${blue}, 0.5)`)
    element.style.setProperty('--ai-group-tint', `rgba(${red}, ${green}, ${blue}, ${luminance < 0.4 ? 0.45 : 0.14})`)
    element.style.setProperty('--ai-group-on', luminance > 0.5 ? '#10151b' : '#ffffff')
}

/** The distinct {{name}} placeholders in the commands */
export function findVariableNames (commands: string[]): string[] {
    return [...new Set(commands.flatMap(command => [...command.matchAll(VARIABLE_PATTERN)].map(match => match[1])))]
}

export function fillVariables (command: string, values: Record<string, string>): string {
    return command.replace(VARIABLE_PATTERN, (_, name: string) => values[name])
}
