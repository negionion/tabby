import { button, guardTerminalEvents } from './dom'
import { applyGroupColor, GROUP_COLORS } from './senderTags'

export interface Dialog {
    overlay: HTMLElement
    editor: HTMLElement
    /** Runs action on Enter (outside IME composition) */
    onEnter: (action: () => void) => void
}

export interface BuiltDialog {
    overlay: HTMLElement
    /** Focuses the first field once the dialog is shown */
    focus: () => void
}

/** Modal shell for the sender dialogs: a click on the backdrop or Escape closes it. The caller fills `editor` and shows `overlay`. */
export function createDialog (title: string, close: () => void): Dialog {
    let enterAction: (() => void)|null = null
    const overlay = document.createElement('div')
    overlay.className = 'ai-sender-tag-editor-overlay'
    overlay.setAttribute('role', 'presentation')
    guardTerminalEvents(overlay)

    const editor = document.createElement('div')
    editor.className = 'ai-sender-tag-editor'
    editor.setAttribute('role', 'dialog')
    editor.setAttribute('aria-modal', 'true')
    editor.setAttribute('aria-label', title)

    const titleElement = document.createElement('div')
    titleElement.className = 'ai-sender-tag-editor-title'
    titleElement.textContent = title
    editor.appendChild(titleElement)
    overlay.appendChild(editor)

    overlay.addEventListener('mousedown', event => {
        if (event.target === overlay) {
            close()
        }
    })
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault()
            close()
        } else if (event.key === 'Enter' && enterAction && !event.isComposing) {
            event.preventDefault()
            enterAction()
        }
    })
    return {
        overlay,
        editor,
        onEnter: action => {
            enterAction = action
        },
    }
}

/** One text input per field; submit gets the values in field order */
export function buildFormDialog (options: {
    title: string
    fields: { label: string, value: string }[]
    confirmLabel: string
    submit: (values: string[]) => void
    close: () => void
}): BuiltDialog {
    const { overlay, editor, onEnter } = createDialog(options.title, options.close)
    const inputs = options.fields.map(field => {
        const label = document.createElement('label')
        label.className = 'ai-sender-tag-editor-label'
        label.textContent = field.label
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'form-control'
        input.value = field.value
        label.appendChild(input)
        editor.appendChild(label)
        return input
    })
    const confirm = () => options.submit(inputs.map(input => input.value))
    onEnter(confirm)
    const actions = document.createElement('div')
    actions.className = 'ai-sender-tag-editor-actions'
    actions.append(
        button('Cancel', 'secondary', options.close),
        button(options.confirmLabel, 'primary', confirm),
    )
    editor.appendChild(actions)
    return {
        overlay,
        focus: () => {
            inputs[0].focus()
            inputs[0].select()
        },
    }
}

/**
 * Palette swatches, the system color picker and a hex field. They only select (hovering a swatch previews
 * it); Confirm applies. apply gets a palette name, a #rrggbb color, or null for an automatic color.
 */
export function buildGroupColorDialog (options: {
    group: string
    /** The group's current color as #rrggbb */
    color: string
    /** The stored choice: palette name, #rrggbb, or null when automatic */
    chosen: string|null
    apply: (color: string|null) => void
    close: () => void
}): BuiltDialog {
    const { group, chosen } = options
    let selected = options.color

    const current = document.createElement('div')
    current.className = 'ai-color-current'
    current.textContent = `Current: ${!chosen ? 'Automatic' : chosen.startsWith('#') ? `Custom ${chosen}` : GROUP_COLORS[chosen].label}`

    const preview = document.createElement('span')
    preview.className = 'ai-saved-group-chip is-active ai-color-preview'
    preview.textContent = group

    const swatches = document.createElement('div')
    swatches.className = 'ai-color-swatches'
    const picker = document.createElement('input')
    picker.type = 'color'
    picker.className = 'ai-color-picker'
    picker.title = 'Pick any color'
    const hexInput = document.createElement('input')
    hexInput.type = 'text'
    hexInput.className = 'form-control ai-color-hex'
    hexInput.placeholder = '#rrggbb'
    hexInput.maxLength = 7
    const error = document.createElement('div')
    error.className = 'ai-sender-tag-editor-error'

    const select = (hex: string) => {
        selected = hex.toLowerCase()
        picker.value = selected
        hexInput.value = selected
        error.textContent = ''
        applyGroupColor(preview, selected)
        for (const swatch of Array.from(swatches.children)) {
            swatch.classList.toggle('is-selected', (swatch as HTMLElement).dataset.hex === selected)
        }
    }
    const restorePreview = () => applyGroupColor(preview, selected)
    for (const color of Object.values(GROUP_COLORS)) {
        const swatch = document.createElement('button')
        swatch.type = 'button'
        swatch.className = 'ai-color-swatch'
        swatch.dataset.hex = color.hex
        swatch.title = color.label
        swatch.style.background = color.hex
        swatch.addEventListener('mouseenter', () => applyGroupColor(preview, color.hex))
        swatch.addEventListener('mouseleave', restorePreview)
        swatch.addEventListener('click', () => select(color.hex))
        swatches.appendChild(swatch)
    }
    picker.addEventListener('input', () => select(picker.value))
    hexInput.addEventListener('input', () => {
        const value = hexInput.value.trim()
        const hex = value.startsWith('#') ? value : `#${value}`
        if (/^#[0-9a-f]{6}$/i.test(hex)) {
            select(hex)
            hexInput.value = value
        }
    })
    const customRow = document.createElement('label')
    customRow.className = 'ai-sender-tag-editor-label ai-color-custom'
    customRow.append('Custom', picker, hexInput)

    const confirm = () => {
        const value = hexInput.value.trim()
        const hex = (value.startsWith('#') ? value : `#${value}`).toLowerCase()
        if (!/^#[0-9a-f]{6}$/.test(hex)) {
            error.textContent = 'Enter a color as #rrggbb.'
            hexInput.focus()
            return
        }
        // A palette color is stored by name, anything else as #rrggbb
        const paletteKey = Object.keys(GROUP_COLORS).find(key => GROUP_COLORS[key].hex === hex)
        options.apply(paletteKey ?? hex)
    }
    const { overlay, editor, onEnter } = createDialog(`Color of "${group}"`, options.close)
    onEnter(confirm)
    const actions = document.createElement('div')
    actions.className = 'ai-sender-tag-editor-actions'
    const automatic = button('Automatic', 'secondary', () => options.apply(null))
    automatic.classList.add('ai-tag-delete-button')
    automatic.title = 'Pick a color that no other group uses'
    actions.append(automatic, button('Cancel', 'secondary', options.close), button('Confirm', 'primary', confirm))

    editor.append(current, preview, swatches, customRow, error, actions)
    select(selected)
    return { overlay, focus: () => hexInput.focus() }
}
