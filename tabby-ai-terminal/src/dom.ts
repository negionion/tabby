/** Small DOM helpers shared by the panel, the sender and their dialogs */

export type ButtonVariant = 'primary'|'success'|'secondary'|'danger'

export function button (label: string, variant: ButtonVariant, click: (event: MouseEvent) => void): HTMLButtonElement {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = `btn btn-sm btn-${variant === 'secondary' ? 'outline-secondary' : variant}`
    element.textContent = label
    element.addEventListener('click', click)
    return element
}

export function textarea (placeholder: string, rows: number): HTMLTextAreaElement {
    const element = document.createElement('textarea')
    element.className = 'form-control'
    element.rows = rows
    element.placeholder = placeholder
    return element
}

function focusEventSurface (surface: HTMLElement, event: MouseEvent): void {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
        return
    }
    if (target.closest('textarea, input, select, button, a, [contenteditable="true"]')) {
        return
    }
    surface.focus({ preventScroll: true })
}

/** Keeps mouse, keyboard and clipboard events inside the element from reaching the terminal below */
export function guardTerminalEvents (element: HTMLElement): void {
    element.tabIndex = -1
    const stopPropagation = (event: Event) => event.stopPropagation()
    element.addEventListener('mousedown', event => {
        focusEventSurface(element, event)
        event.stopPropagation()
    })
    for (const eventName of ['click', 'mouseup', 'dblclick', 'contextmenu']) {
        element.addEventListener(eventName, stopPropagation)
    }
    for (const eventName of ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'copy', 'cut', 'paste']) {
        element.addEventListener(eventName, stopPropagation)
    }
    element.addEventListener('wheel', stopPropagation, { passive: true })
    element.addEventListener('touchmove', stopPropagation, { passive: true })
}
