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
const store = { aiTerminal: { maxSessionOutputLines: 1000, savedSenderCommands: [], senderGroupFilter: '', senderCommandInsertMode: 'replace', senderVariables: {} } }
let saves = 0
const config = { store, save: async () => { saves++ }, changed$: sub }
const auth = { statusChanged$: sub, cliUpdated$: sub, isCliUpdating: () => false, getCliUpdateStatus: () => undefined, getKnownCliVersion: () => undefined, getSelectedProvider: () => 'claude', getSelectedModel: () => 'opus', getAvailableModels: async () => ['auto'], getClaudeModelStatus: () => undefined, checkSelectedProviderStatus: async () => ({ provider: 'claude', state: 'logged-in', label: 'ok' }), publishStatus () {} }
const runner = { run () { return { cancel () {} } }, getClaudeRunSettings: () => ({ mode: 'plan' }) }
let menu = null, boxes = [], decide = 0
const platform = { showMessageBox: async o => { boxes.push(o); return { response: decide } }, setClipboard () {}, popupContextMenu: items => { menu = items } }
const p = new AITerminalPanel(tab, auth, runner, config, platform)
host.append(p.element, p.senderElement)

const bar = () => p.savedGroupBar
const chips = () => [...bar().querySelectorAll('.ai-saved-group-chip')]
const chipText = () => chips().filter(c => !c.classList.contains('is-empty')).map(c => `${c.querySelector('.ai-saved-group-name').textContent}:${c.querySelector('.ai-saved-group-count').textContent}${c.classList.contains('is-active') ? '*' : ''}`).join(' ')
const chip = name => chips().find(c => c.querySelector('.ai-saved-group-name').textContent === name)
const tabs = () => [...p.savedCommandTabs.querySelectorAll('.ai-saved-command-tab')].map(t => t.textContent)
const tabEl = label => [...p.savedCommandTabs.querySelectorAll('.ai-saved-command-tab')].find(t => t.textContent === label)
const saved = () => store.aiTerminal.savedSenderCommands.map(i => `${i.name || i.command}${i.group ? '@' + i.group : ''}`).join(',')
const fire = (el, type, clientX = 0) => { const e = new dom.window.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'clientX', { value: clientX }); el.dispatchEvent(e); return e }
const drag = (src, dst, clientX) => { fire(src, 'dragstart'); fire(dst, 'dragover', clientX); fire(dst, 'drop', clientX); fire(src, 'dragend') }
const menuItem = label => menu.find(i => i.label === label)
const dialog = () => document.querySelector('.ai-sender-tag-editor-overlay')
const toolbar = () => p.savedGroupBar.parentElement

;(async () => {
  // no groups: unchanged layout
  store.aiTerminal.savedSenderCommands = [{ name: '5000 upgrade', command: 'sysupgrade /tmp/fw.bin' }, { name: 'check Wi-Fi', command: 'iwconfig' }]
  p.renderSavedCommandTabs()
  ok('no groups: group bar hidden, toolbar without has-groups', bar().hidden && toolbar() && !toolbar().classList.contains('has-groups'))
  ok('no groups: all tags shown', tabs().join('|') === '5000 upgrade|check Wi-Fi')

  // save a tag with a group through the editor
  p.draft.value = 'fw_printenv'
  p.openSenderTagEditor()
  let inputs = dialog().querySelectorAll('input')
  ok('editor has Name and Group inputs', inputs.length === 2 && dialog().textContent.includes('Group (optional)'))
  inputs[0].value = '5000 env'; inputs[1].value = '  EAP5000  '
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Save').click()
  await sleep(10)
  ok('saved with trimmed group', saved() === '5000 upgrade,check Wi-Fi,5000 env@EAP5000', saved())
  ok('group bar visible: All, group, Ungrouped', !bar().hidden && toolbar().classList.contains('has-groups') && chipText() === 'All:3* EAP5000:1 Ungrouped:2', chipText())

  // mixed data
  store.aiTerminal.savedSenderCommands = [
    { name: 'ap1', command: 'cmd ap1', group: 'AP' },
    { name: 'u1', command: 'cmd u1' },
    { name: 'e1', command: 'cmd e1 {{ip}}', group: 'EAP5000' },
    { name: 'ap2', command: 'cmd ap2 {{ip}} {{port}}', group: 'AP' },
    { name: 'e2', command: 'cmd e2', group: 'EAP5000' },
    { name: 'bad', command: 'cmd bad', group: '__ungrouped__' },
  ]
  p.renderSavedCommandTabs()
  ok('groups in first-appearance order with counts; reserved name ignored', chipText() === 'All:6* AP:2 EAP5000:2 Ungrouped:2', chipText())

  // filter
  chip('AP').click()
  ok('click group filters tags', tabs().join('|') === 'ap1|ap2' && chipText().includes('AP:2*'))
  ok('filter persisted', store.aiTerminal.senderGroupFilter === 'AP' && saves > 0)
  chip('Ungrouped').click()
  ok('Ungrouped filter', tabs().join('|') === 'u1|bad')
  chip('All').click()
  ok('All filter', tabs().length === 6)

  // editor defaults to active group
  chip('EAP5000').click()
  p.draft.value = 'reboot'
  p.openSenderTagEditor()
  inputs = dialog().querySelectorAll('input')
  ok('new tag defaults to active group', inputs[1].value === 'EAP5000')
  ok('group suggestions listed', [...dialog().querySelectorAll('datalist option')].map(o => o.value).join(',') === 'AP,EAP5000')
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Save').click()
  await sleep(10)
  ok('new tag placed after its group', saved() === 'ap1@AP,u1,e1@EAP5000,ap2@AP,e2@EAP5000,reboot@EAP5000,bad', saved())
  ok('tab shown in current filter', tabs().join('|') === 'e1|e2|reboot')

  // saving into another group switches the filter so the tag is visible
  p.draft.value = 'iw dev'
  p.openSenderTagEditor()
  inputs = dialog().querySelectorAll('input')
  inputs[1].value = 'Wi-Fi'
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Save').click()
  await sleep(10)
  ok('filter follows saved tag group', store.aiTerminal.senderGroupFilter === 'Wi-Fi' && tabs().join('|') === 'iw dev')

  // edit keeps group, editing a tag shows its group
  const wifiIndex = store.aiTerminal.savedSenderCommands.findIndex(i => i.command === 'iw dev')
  p.openSenderTagEditor(wifiIndex)
  ok('edit dialog shows tag group', dialog().querySelectorAll('input')[1].value === 'Wi-Fi')
  p.closeSenderTagEditor()

  // tag click still inserts
  chip('All').click()
  tabEl('u1').click()
  ok('tag click inserts command (no vars)', p.draft.value === 'cmd u1')

  // group context menu: insert all with variables
  fire(chip('AP'), 'contextmenu')
  ok('group menu items', menu && menu.map(i => i.label || i.type).join('|') === 'Insert all into Sender (2)|separator|Rename group...|Color|Delete group', menu && menu.map(i => i.label || i.type).join('|'))
  store.aiTerminal.senderVariables = { ip: '10.0.0.1' }
  menu[0].click()
  inputs = dialog().querySelectorAll('input')
  ok('one dialog for union of variables, remembered value prefilled', inputs.length === 2 && inputs[0].value === '10.0.0.1' && inputs[1].value === '')
  inputs[1].value = '22'
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Insert').click()
  ok('group inserted line by line with values', p.draft.value === 'cmd ap1\ncmd ap2 10.0.0.1 22' && !dialog(), JSON.stringify(p.draft.value))
  ok('variables remembered', store.aiTerminal.senderVariables.port === '22')
  store.aiTerminal.senderCommandInsertMode = 'append'
  fire(chip('Ungrouped'), 'contextmenu')
  ok('Ungrouped menu: insert only', menu.length === 1 && menu[0].label === 'Insert all into Sender (2)')
  menu[0].click()
  ok('append mode appends group', p.draft.value === 'cmd ap1\ncmd ap2 10.0.0.1 22\ncmd u1\ncmd bad')
  store.aiTerminal.senderCommandInsertMode = 'replace'

  // rename
  chip('AP').click()
  fire(chip('AP'), 'contextmenu')
  menuItem('Rename group...').click()
  inputs = dialog().querySelectorAll('input')
  ok('rename dialog prefilled', inputs.length === 1 && inputs[0].value === 'AP')
  inputs[0].value = '   '
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Rename').click()
  ok('empty name keeps dialog open', !!dialog())
  inputs[0].value = 'AP-common'
  fire(inputs[0], 'keydown'); const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }); inputs[0].dispatchEvent(enter)
  await sleep(10)
  ok('renamed, filter follows', saved().includes('ap1@AP-common') && saved().includes('ap2@AP-common') && store.aiTerminal.senderGroupFilter === 'AP-common' && !dialog())
  // rename into existing group merges
  fire(chip('Wi-Fi'), 'contextmenu'); menuItem('Rename group...').click()
  dialog().querySelector('input').value = 'EAP5000'
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Rename').click()
  await sleep(10)
  ok('rename to existing merges', !chip('Wi-Fi') && chip('EAP5000').querySelector('.ai-saved-group-count').textContent === '4', chipText())

  // delete group
  decide = 1
  fire(chip('AP-common'), 'contextmenu'); menuItem('Delete group').click(); await sleep(10)
  ok('delete asks, Cancel keeps group', boxes.at(-1).message === 'Delete group "AP-common"?' && boxes.at(-1).detail.includes('2 tags move to Ungrouped') && !!chip('AP-common'))
  decide = 0
  fire(chip('AP-common'), 'contextmenu'); menuItem('Delete group').click(); await sleep(10)
  ok('delete moves tags to Ungrouped, commands kept, filter falls back to All', !chip('AP-common') && saved().includes('ap1,') && saved().includes('ap2') && chipText().startsWith('All:8*'), chipText())

  // drag: reorder within group
  store.aiTerminal.savedSenderCommands = [
    { name: 'a1', command: 'a1', group: 'A' }, { name: 'a2', command: 'a2', group: 'A' }, { name: 'a3', command: 'a3', group: 'A' },
    { name: 'b1', command: 'b1', group: 'B' }, { name: 'u1', command: 'u1' },
  ]
  store.aiTerminal.senderGroupFilter = ''
  p.renderSavedCommandTabs()
  ok('tags draggable', tabEl('a1').draggable === true && chip('A').draggable === true && chip('All').draggable === false)
  drag(tabEl('a3'), tabEl('a1'), -1); await sleep(10)
  ok('drop before', saved() === 'a3@A,a1@A,a2@A,b1@B,u1', saved())
  drag(tabEl('a3'), tabEl('a2'), 1); await sleep(10)
  ok('drop after', saved() === 'a1@A,a2@A,a3@A,b1@B,u1', saved())
  ok('drag classes cleared', !p.senderElement.querySelector('.is-dragging, .is-drop-before, .is-drop-after, .is-drop-target'))
  // drag onto tag of another group joins it
  drag(tabEl('u1'), tabEl('b1'), -1); await sleep(10)
  ok('drop on other group tag joins that group', saved() === 'a1@A,a2@A,a3@A,u1@B,b1@B', saved())
  // drag onto group chip
  drag(tabEl('a1'), chip('B')); await sleep(10)
  ok('drop on group chip moves to end of group', saved() === 'a2@A,a3@A,u1@B,b1@B,a1@B', saved())
  // Ungrouped chip shown during drag even when empty
  ok('empty Ungrouped chip hidden when idle', chip('Ungrouped').classList.contains('is-empty') && !bar().classList.contains('is-dragging-tag'))
  fire(tabEl('b1'), 'dragstart')
  ok('Ungrouped chip revealed while dragging a tag', bar().classList.contains('is-dragging-tag'))
  fire(chip('Ungrouped'), 'dragover'); fire(chip('Ungrouped'), 'drop'); fire(tabEl('b1') || chip('All'), 'dragend'); await sleep(10)
  ok('drop on Ungrouped removes group', saved() === 'a2@A,a3@A,u1@B,a1@B,b1', saved())
  // reorder groups
  drag(chip('B'), chip('A'), -1); await sleep(10)
  ok('drag group before another moves its tags', saved() === 'u1@B,a1@B,a2@A,a3@A,b1' && chipText().startsWith('All:5* B:2 A:2'), saved())
  drag(chip('B'), chip('A'), 1); await sleep(10)
  ok('drag group after another', saved() === 'a2@A,a3@A,u1@B,a1@B,b1', saved())
  // dropping group onto itself or onto All is ignored
  const e = fire(chip('All'), 'dragover')
  ok('All chip is not a drop target', !e.defaultPrevented)
  // drop event must not reach the terminal
  let leaked = false
  host.addEventListener('drop', () => { leaked = true })
  drag(tabEl('a2'), tabEl('a3'), 1); await sleep(10)
  ok('drop does not bubble to the terminal host', !leaked)

  // collapse: clicks inside the sender heading must not collapse or expand it
  const collapsed = () => host.classList.contains('ai-terminal-sender-collapsed')
  const mouse = (el, type) => el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true }))
  const press = el => { mouse(el, 'mousedown'); el.focus(); mouse(el, 'mouseup'); el.click() }
  p.draft.value = ''; p.draft.blur(); p.senderForceOpen = false; p.updateSenderState()
  ok('empty sender collapsed', collapsed())
  press(chip('B'))
  ok('group click while collapsed keeps it collapsed', collapsed() && store.aiTerminal.senderGroupFilter === 'B', `collapsed=${collapsed()} filter=${store.aiTerminal.senderGroupFilter} force=${p.senderForceOpen} active=${document.activeElement && document.activeElement.className}`)
  press(chip('All'))
  p.draft.focus(); p.updateSenderState()
  ok('focused draft expands', !collapsed())
  press(chip('A'))
  ok('group click while expanded keeps it expanded', !collapsed() && store.aiTerminal.senderGroupFilter === 'A', `collapsed=${collapsed()}`)
  press(chip('B'))
  ok('second group click still expanded', !collapsed() && store.aiTerminal.senderGroupFilter === 'B')
  await sleep(5)
  mouse(document.body, 'mousedown')
  ok('click outside the sender collapses it', collapsed(), `force=${p.senderForceOpen} active=${document.activeElement && document.activeElement.className} lines=${p.draft.value}`)
  p.draft.focus(); p.updateSenderState()
  p.draft.blur()
  ok('draft blur to outside collapses it', collapsed())
  press(tabEl('b1') || p.savedCommandTabs.querySelector('.ai-saved-command-tab'))
  ok('tag click inserts and expands', !collapsed() && p.draft.value !== '')
  p.destroy()
  ok('destroy removes the document listener', (() => { p.senderForceOpen = true; mouse(document.body, 'mousedown'); return p.senderForceOpen === true })())

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
  process.exit(failed ? 1 : 0)
})().catch(e => { console.log('ERROR', e); process.exit(1) })
