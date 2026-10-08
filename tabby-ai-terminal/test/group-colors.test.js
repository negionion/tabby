const { JSDOM } = require('jsdom')
const { loadPanel, installDom } = require('./harness')
const dom = new JSDOM('<!doctype html><body><div id=tab></div></body>', { pretendToBeVisual: true })
installDom(dom)
const { AITerminalPanel } = loadPanel()
const sleep = ms => new Promise(r => setTimeout(r, ms))
let failed = 0
const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`) }
const host = document.getElementById('tab')
const tab = { element: { nativeElement: host }, title: 'COM10', customTitle: null, sendInput () {}, frontend: { focus () {} }, configure () {} }
const sub = { subscribe: () => ({ unsubscribe () {} }) }
const store = { aiTerminal: { maxSessionOutputLines: 1000, senderGroupColors: {}, savedSenderCommands: [
  { name: 'a1', command: 'a1', group: 'EAP5000' }, { name: 'b1', command: 'b1', group: 'Wi-Fi' }, { name: 'u1', command: 'u1' }, { name: 'a2', command: 'a2', group: 'EAP5000' },
] } }
const auth = { statusChanged$: sub, cliUpdated$: sub, isCliUpdating: () => false, getCliUpdateStatus: () => undefined, getKnownCliVersion: () => undefined, getSelectedProvider: () => 'claude', getSelectedModel: () => 'opus', getAvailableModels: async () => ['auto'], getClaudeModelStatus: () => undefined, publishStatus () {} }
let menu = null
const platform = { showMessageBox: async () => ({ response: 0 }), setClipboard () {}, popupContextMenu: items => { menu = items } }
const p = new AITerminalPanel(tab, auth, { run () { return { cancel () {} } }, getClaudeRunSettings: () => ({ requested: 'plan', mode: 'plan' }) }, { store, save: async () => {}, changed$: sub }, platform)
host.append(p.element, p.senderElement)
const chip = name => [...p.savedGroupBar.querySelectorAll('.ai-saved-group-chip')].find(c => c.querySelector('.ai-saved-group-name').textContent === name)
// Tags are listed in the menu of the All chip
const tagEl = name => {
  if (p.tagMenuFilter !== '') { p.closeTagMenu(); chip('All').click() }
  return [...document.querySelectorAll('.ai-tag-menu-item')].find(r => r.querySelector('.ai-tag-menu-name').textContent === name)
}
const color = el => el.style.getPropertyValue('--ai-group-color')
;(async () => {
  p.renderSavedCommandTabs()
  const eap = color(chip('EAP5000')), wifi = color(chip('Wi-Fi'))
  ok('each group gets an automatic color', /^#[0-9a-f]{6}$/.test(eap) && /^#[0-9a-f]{6}$/.test(wifi), `${eap} ${wifi}`)
  ok('tint and border variables set', chip('EAP5000').style.getPropertyValue('--ai-group-tint').startsWith('rgba(') && chip('EAP5000').style.getPropertyValue('--ai-group-border').endsWith('0.5)'))
  ok('All and Ungrouped use neutral colors', color(chip('All')) === '#a9bed1' && color(chip('Ungrouped')) === '#a9b4c0')
  ok('tags carry their group color', tagEl('a1').classList.contains('has-group') && color(tagEl('a1')) === eap && color(tagEl('b1')) === wifi && !tagEl('u1').classList.contains('has-group') && color(tagEl('u1')) === '')
  // stable when reordered
  store.aiTerminal.savedSenderCommands.reverse(); p.renderSavedCommandTabs()
  ok('automatic color does not change when groups are reordered', color(chip('EAP5000')) === eap && color(chip('Wi-Fi')) === wifi)
  // choose a color: menu entry opens the dialog, a swatch applies at once
  const dlg = () => document.querySelector('.ai-sender-tag-editor-overlay')
  const colorMenu = name => { chip(name).dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); return menu.find(i => i.label === 'Color').submenu }
  const openColor = name => colorMenu(name).at(-1).click()
  let items = colorMenu('EAP5000')
  ok('Color submenu: 10 radio items, no separator, only Automatic checked', items.length === 10 && items.every(i => i.type === 'radio') && items.filter(i => i.checked).map(i => i.label).join() === 'Automatic', items.map(i => `${i.label}${i.checked ? '*' : ''}`).join(','))
  items.find(i => i.label === 'Purple').click(); await sleep(10)
  items = colorMenu('EAP5000')
  ok('picking from the list applies it and checks only that item', store.aiTerminal.senderGroupColors.EAP5000 === 'purple' && items.filter(i => i.checked).map(i => i.label).join() === 'Purple')
  ;(await p.setGroupColor('EAP5000', null))
  openColor('EAP5000')
  ok('dialog shows the current color and 8 swatches', dlg().querySelector('.ai-color-current').textContent === 'Current: Automatic' && dlg().querySelectorAll('.ai-color-swatch').length === 8)
  const purple = [...dlg().querySelectorAll('.ai-color-swatch')].find(b => b.title === 'Purple')
  purple.dispatchEvent(new dom.window.MouseEvent('mouseenter'))
  ok('hovering a swatch previews it', dlg().querySelector('.ai-color-preview').style.getPropertyValue('--ai-group-color') === '#c297ff')
  purple.dispatchEvent(new dom.window.MouseEvent('mouseleave'))
  ok('leaving restores the preview', dlg().querySelector('.ai-color-preview').style.getPropertyValue('--ai-group-color') === eap)
  purple.click(); await sleep(10)
  ok('swatch click only selects: dialog stays, nothing saved, swatch marked', !!dlg() && !('EAP5000' in store.aiTerminal.senderGroupColors) && purple.classList.contains('is-selected') && dlg().querySelector('.ai-color-hex').value === '#c297ff')
  ok('Custom row has no Apply, actions are Automatic / Cancel / Confirm', ![...dlg().querySelectorAll('button')].some(b => b.textContent === 'Apply') && [...dlg().querySelectorAll('.ai-sender-tag-editor-actions button')].map(b => b.textContent).join() === 'Automatic,Cancel,Confirm')
  ;[...dlg().querySelectorAll('button')].find(b => b.textContent === 'Cancel').click(); await sleep(10)
  ok('Cancel discards the selection', !dlg() && !('EAP5000' in store.aiTerminal.senderGroupColors))
  openColor('EAP5000')
  ;[...dlg().querySelectorAll('.ai-color-swatch')].find(b => b.title === 'Purple').click()
  ;[...dlg().querySelectorAll('button')].find(b => b.textContent === 'Confirm').click(); await sleep(10)
  ok('Confirm applies the selected swatch', !dlg() && store.aiTerminal.senderGroupColors.EAP5000 === 'purple' && color(chip('EAP5000')) === '#c297ff' && color(tagEl('a1')) === '#c297ff')
  openColor('EAP5000')
  ok('dialog marks the chosen swatch', dlg().querySelector('.ai-color-current').textContent === 'Current: Purple' && [...dlg().querySelectorAll('.ai-color-swatch.is-selected')].map(b => b.title).join() === 'Purple')
  p.closeSenderTagEditor()
  // rename moves the color
  await p.renameGroup('EAP5000', 'EAP-5000')
  ok('rename moves the color', store.aiTerminal.senderGroupColors['EAP-5000'] === 'purple' && !('EAP5000' in store.aiTerminal.senderGroupColors) && color(chip('EAP-5000')) === '#c297ff')
  // merge keeps target color
  await p.setGroupColor('Wi-Fi', 'teal')
  await p.renameGroup('EAP-5000', 'Wi-Fi')
  ok('merging keeps the target group color', store.aiTerminal.senderGroupColors['Wi-Fi'] === 'teal' && Object.keys(store.aiTerminal.senderGroupColors).join() === 'Wi-Fi')
  // automatic again
  await p.setGroupColor('Wi-Fi', null)
  ok('Automatic removes the chosen color', !('Wi-Fi' in store.aiTerminal.senderGroupColors) && color(chip('Wi-Fi')) !== '#5fd4d4' && ['#ffc75e', '#6cb6ff', '#7ee787', '#c297ff', '#ff8fc8', '#5fd4d4', '#ff7b72'].includes(color(chip('Wi-Fi'))), color(chip('Wi-Fi')))
  // delete removes the color
  await p.setGroupColor('Wi-Fi', 'red')
  await p.deleteGroup('Wi-Fi')
  ok('delete removes the color', Object.keys(store.aiTerminal.senderGroupColors).length === 0)
  // custom color dialog
  store.aiTerminal.savedSenderCommands = [{ command: 'c1', group: 'Lab' }, { command: 'c2', group: 'Lab' }]
  store.aiTerminal.senderGroupColors = {}
  p.renderSavedCommandTabs()
  openColor('Lab')
  ok('color dialog with 8 swatches, picker and hex field', dlg() && dlg().querySelectorAll('.ai-color-swatch').length === 8 && dlg().querySelector('input[type=color]') && dlg().querySelector('.ai-color-hex').value === color(chip('Lab')))
  const hex = dlg().querySelector('.ai-color-hex')
  hex.value = '12345'; [...dlg().querySelectorAll('button')].find(b => b.textContent === 'Confirm').click()
  ok('invalid hex keeps the dialog open with an error', !!dlg() && dlg().querySelector('.ai-sender-tag-editor-error').textContent.includes('#rrggbb'))
  hex.value = '1E3A5F'; hex.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  ok('typing a hex updates preview and picker', dlg().querySelector('input[type=color]').value === '#1e3a5f' && dlg().querySelector('.ai-color-preview').style.getPropertyValue('--ai-group-color') === '#1e3a5f')
  ok('dark color gets white text on the filled chip', dlg().querySelector('.ai-color-preview').style.getPropertyValue('--ai-group-on') === '#ffffff')
  dlg().querySelector('.ai-color-hex').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(10)
  ok('custom color stored as hex and applied', store.aiTerminal.senderGroupColors.Lab === '#1e3a5f' && color(chip('Lab')) === '#1e3a5f' && !dlg())
  openColor('Lab')
  ok('dialog shows the custom color as current', dlg().querySelector('.ai-color-current').textContent === 'Current: Custom #1e3a5f')
  p.closeSenderTagEditor()
  items = colorMenu('Lab')
  ok('list marks the custom color', items.at(-1).label === 'Custom (#1e3a5f)...' && items.filter(i => i.checked).map(i => i.label).join() === 'Custom (#1e3a5f)...')
  openColor('Lab')
  ;[...dlg().querySelectorAll('.ai-color-swatch')].find(b => b.title === 'Green').click()
  dlg().querySelector('.ai-color-hex').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(10)
  ok('a palette color is stored by name', store.aiTerminal.senderGroupColors.Lab === 'green')
  openColor('Lab')
  ;[...dlg().querySelectorAll('button')].find(b => b.textContent === 'Automatic').click(); await sleep(10)
  ok('Automatic in the dialog clears the color', !('Lab' in store.aiTerminal.senderGroupColors))
  // automatic colors do not collide
  store.aiTerminal.senderGroupColors = { Fixed: 'amber' }
  store.aiTerminal.savedSenderCommands = ['EAP5000', 'Wi-Fi', 'Debug', 'Danger', 'Mesh', 'LB', 'Fixed'].map(g => ({ command: g, group: g }))
  p.renderSavedCommandTabs()
  const autos = ['EAP5000', 'Wi-Fi', 'Debug', 'Danger', 'Mesh', 'LB'].map(g => color(chip(g)))
  ok('six automatic groups get six different colors, none equal to a chosen color', new Set(autos).size === 6 && !autos.includes('#ffc75e'), autos.join(' '))
  store.aiTerminal.savedSenderCommands.reverse(); p.renderSavedCommandTabs()
  ok('still the same colors after reordering', ['EAP5000', 'Wi-Fi', 'Debug', 'Danger', 'Mesh', 'LB'].map(g => color(chip(g))).join() === autos.join())
  store.aiTerminal.senderGroupColors = { Debug: '#1e3a5f' }; p.renderSavedCommandTabs()
  ok('dark custom color: lightened accent for text, real color for the filled chip', chip('Debug').style.getPropertyValue('--ai-group-accent').startsWith('rgb(') && chip('Debug').style.getPropertyValue('--ai-group-color') === '#1e3a5f' && chip('Debug').style.getPropertyValue('--ai-group-on') === '#ffffff')
  // invalid stored color falls back to automatic
  store.aiTerminal.savedSenderCommands = [{ command: 'x', group: 'G' }]
  store.aiTerminal.senderGroupColors = { G: 'rainbow' }
  p.renderSavedCommandTabs()
  ok('unknown color name falls back to automatic', /^#[0-9a-f]{6}$/.test(color(chip('G'))))
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0)
})().catch(e => { console.log('ERROR', e); process.exit(1) })
