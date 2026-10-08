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
const store = { aiTerminal: { maxSessionOutputLines: 1000, savedSenderCommands: [], senderCommandInsertMode: 'replace', senderVariables: {} } }
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
const tagMenu = () => document.querySelector('.ai-tag-menu')
const rows = () => (tagMenu() ? [...tagMenu().querySelectorAll('.ai-tag-menu-item')] : [])
const items = () => rows().map(r => r.querySelector('.ai-tag-menu-name').textContent)
const row = name => rows().find(r => r.querySelector('.ai-tag-menu-name').textContent === name)
const open = name => { if (p.tagMenuFilter !== null) p.closeTagMenu(); chip(name).click() }
const saved = () => store.aiTerminal.savedSenderCommands.map(i => `${i.name || i.command}${i.group ? '@' + i.group : ''}`).join(',')
const fire = (el, type, clientX = 0, clientY = 0) => { const e = new dom.window.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'clientX', { value: clientX }); Object.defineProperty(e, 'clientY', { value: clientY }); el.dispatchEvent(e); return e }
const drag = (src, dst, clientX = 0, clientY = 0) => { fire(src, 'dragstart'); fire(dst, 'dragover', clientX, clientY); fire(dst, 'drop', clientX, clientY); fire(src, 'dragend') }
const menuItem = label => menu.find(i => i.label === label)
const dialog = () => document.querySelector('.ai-sender-tag-editor-overlay')
const mouse = (el, type) => el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true }))

;(async () => {
  // no tags, then no groups
  p.renderSavedCommandTabs()
  ok('no tags: hint instead of chips', !chips().length && bar().textContent.includes('No saved tags yet'))
  ok('tag row is gone from the sender', !p.senderElement.querySelector('.ai-saved-command-tabs, .ai-saved-command-tab'))
  store.aiTerminal.savedSenderCommands = [{ name: '5000 upgrade', command: 'sysupgrade /tmp/fw.bin' }, { name: 'check Wi-Fi', command: 'iwconfig' }]
  p.renderSavedCommandTabs()
  ok('no groups: one Tags chip', chipText() === 'Tags:2', chipText())
  ok('chip bar is not hidden (Bootstrap hides [hidden] with !important)', !bar().hidden && !bar().closest('[hidden]'))
  open('Tags')
  ok('chip opens the tag menu on document.body', !!tagMenu() && tagMenu().parentElement === document.body && chip('Tags').classList.contains('is-active'))
  ok('menu lists name and command', items().join('|') === '5000 upgrade|check Wi-Fi' && row('check Wi-Fi').querySelector('.ai-tag-menu-command').textContent === 'iwconfig')
  ok('menu opens upwards: bottom and max-height set', tagMenu().style.bottom.endsWith('px') && tagMenu().style.maxHeight.endsWith('px'))
  chip('Tags').click()
  ok('clicking the chip again closes the menu', !tagMenu() && !chip('Tags').classList.contains('is-active'))

  // save a tag with a group through the editor
  p.draft.value = 'fw_printenv'
  p.openSenderTagEditor()
  let inputs = dialog().querySelectorAll('input')
  ok('editor has Name and Group inputs', inputs.length === 2 && dialog().textContent.includes('Group (optional)'))
  ok('+ Save starts without a group', inputs[1].value === '')
  inputs[0].value = '5000 env'; inputs[1].value = '  EAP5000  '
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Save').click()
  await sleep(10)
  ok('saved with trimmed group', saved() === '5000 upgrade,check Wi-Fi,5000 env@EAP5000', saved())
  ok('chips: All, group, Ungrouped', chipText() === 'All:3 EAP5000:1 Ungrouped:2', chipText())

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
  ok('groups in first-appearance order with counts; reserved name ignored', chipText() === 'All:6 AP:2 EAP5000:2 Ungrouped:2', chipText())

  // menus per chip
  open('AP')
  ok('group chip lists its tags', items().join('|') === 'ap1|ap2' && chipText().includes('AP:2*'))
  ok('tags carry their group color bar', row('ap1').classList.contains('has-group') && row('ap1').style.getPropertyValue('--ai-group-accent') !== '')
  open('Ungrouped')
  ok('Ungrouped chip lists tags without a group', items().join('|') === 'u1|bad')
  open('All')
  ok('All lists every tag', items().length === 6)
  ok('switching chips keeps one menu', document.querySelectorAll('.ai-tag-menu').length === 1)

  // click inserts and closes
  row('u1').click()
  ok('tag click inserts and closes the menu', p.draft.value === 'cmd u1' && !tagMenu())

  // + Save current here presets the group
  open('EAP5000')
  p.draft.value = 'reboot'
  ;[...tagMenu().querySelectorAll('button')].find(b => b.textContent === '+ Save current here').click()
  inputs = dialog().querySelectorAll('input')
  ok('Save current here presets the group and closes the menu', inputs[1].value === 'EAP5000' && !tagMenu())
  ok('group suggestions listed', [...dialog().querySelectorAll('datalist option')].map(o => o.value).join(',') === 'AP,EAP5000')
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Save').click()
  await sleep(10)
  ok('new tag placed after its group', saved() === 'ap1@AP,u1,e1@EAP5000,ap2@AP,e2@EAP5000,reboot@EAP5000,bad', saved())

  // edit dialog shows the tag's group
  const rebootIndex = store.aiTerminal.savedSenderCommands.findIndex(i => i.command === 'reboot')
  p.openSenderTagEditor(rebootIndex)
  ok('edit dialog shows tag group', dialog().querySelectorAll('input')[1].value === 'EAP5000')
  p.closeSenderTagEditor()

  // right-click on a tag: Edit / Move to group / Delete
  open('EAP5000')
  fire(row('reboot'), 'contextmenu')
  ok('tag menu actions', menu.map(i => i.label || i.type).join('|') === 'Edit...|Move to group|separator|Delete', menu.map(i => i.label || i.type).join('|'))
  const move = menuItem('Move to group').submenu
  ok('move targets: groups, Ungrouped, New group; current group disabled', move.map(i => i.label || i.type).join('|') === 'AP|EAP5000|separator|Ungrouped|New group...' && move.find(i => i.label === 'EAP5000').enabled === false, move.map(i => i.label || i.type).join('|'))
  move.find(i => i.label === 'AP').click(); await sleep(10)
  ok('Move to group moves the tag to the end of that group', saved() === 'ap1@AP,u1,e1@EAP5000,ap2@AP,reboot@AP,e2@EAP5000,bad', saved())
  ok('open menu refreshes after the move', items().join('|') === 'e1|e2')
  open('AP')
  fire(row('reboot'), 'contextmenu'); menuItem('Move to group').submenu.find(i => i.label === 'New group...').click()
  dialog().querySelector('input').value = 'Danger'
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Move').click(); await sleep(10)
  ok('Move to a new group creates it', saved().includes('reboot@Danger') && !!chip('Danger'), chipText())
  open('Danger')
  fire(row('reboot'), 'contextmenu'); menuItem('Edit...').click()
  ok('Edit opens the editor and closes the menu', !!dialog() && !tagMenu() && dialog().querySelector('input').value === '')
  p.closeSenderTagEditor()
  open('Danger')
  fire(row('reboot'), 'contextmenu'); menuItem('Delete').click(); await sleep(10)
  ok('Delete removes the tag', !saved().includes('reboot') && !chip('Danger'))

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
  open('AP')
  fire(chip('AP'), 'contextmenu')
  menuItem('Rename group...').click()
  inputs = dialog().querySelectorAll('input')
  ok('rename dialog prefilled', inputs.length === 1 && inputs[0].value === 'AP')
  inputs[0].value = '   '
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Rename').click()
  ok('empty name keeps dialog open', !!dialog())
  inputs[0].value = 'AP-common'
  inputs[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(10)
  ok('renamed, open menu follows', saved().includes('ap1@AP-common') && saved().includes('ap2@AP-common') && p.tagMenuFilter === 'AP-common' && !dialog())
  // rename into existing group merges
  fire(chip('EAP5000'), 'contextmenu'); menuItem('Rename group...').click()
  dialog().querySelector('input').value = 'AP-common'
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Rename').click()
  await sleep(10)
  ok('rename to existing merges', !chip('EAP5000') && chip('AP-common').querySelector('.ai-saved-group-count').textContent === '4', chipText())

  // delete group
  decide = 1
  fire(chip('AP-common'), 'contextmenu'); menuItem('Delete group').click(); await sleep(10)
  ok('delete asks, Cancel keeps group', boxes.at(-1).message === 'Delete group "AP-common"?' && boxes.at(-1).detail.includes('4 tags move to Ungrouped') && !!chip('AP-common'))
  decide = 0
  fire(chip('AP-common'), 'contextmenu'); menuItem('Delete group').click(); await sleep(10)
  ok('delete moves tags to Ungrouped, commands kept, menu closes', !chip('AP-common') && saved().includes('ap1,') && saved().includes('ap2') && chipText() === 'Tags:6' && !tagMenu(), chipText())

  // drag: reorder in the menu (vertical), into another group, onto chips, groups
  store.aiTerminal.savedSenderCommands = [
    { name: 'a1', command: 'a1', group: 'A' }, { name: 'a2', command: 'a2', group: 'A' }, { name: 'a3', command: 'a3', group: 'A' },
    { name: 'b1', command: 'b1', group: 'B' }, { name: 'u1', command: 'u1' },
  ]
  p.renderSavedCommandTabs()
  open('A')
  ok('menu tags and group chips draggable, All is not', row('a1').draggable === true && chip('A').draggable === true && chip('All').draggable === false)
  drag(row('a3'), row('a1'), 0, -1); await sleep(10)
  ok('drop above (vertical midpoint)', saved() === 'a3@A,a1@A,a2@A,b1@B,u1', saved())
  drag(row('a3'), row('a2'), 0, 1); await sleep(10)
  ok('drop below', saved() === 'a1@A,a2@A,a3@A,b1@B,u1', saved())
  ok('drag classes cleared', !document.querySelector('.is-dragging, .is-drop-before, .is-drop-after, .is-drop-target'))
  drag(row('a1'), chip('B')); await sleep(10)
  ok('drop on group chip moves to end of group', saved() === 'a2@A,a3@A,b1@B,a1@B,u1', saved())
  ok('empty Ungrouped chip hidden when idle', !chip('Ungrouped').classList.contains('is-empty'))
  open('All')
  drag(row('u1'), row('b1'), 0, -1); await sleep(10)
  ok('drop on a tag of another group joins it', saved() === 'a2@A,a3@A,u1@B,b1@B,a1@B', saved())
  ok('Ungrouped chip hidden once empty', chip('Ungrouped').classList.contains('is-empty'))
  fire(row('b1'), 'dragstart')
  ok('Ungrouped chip revealed while dragging a tag', bar().classList.contains('is-dragging-tag'))
  fire(chip('Ungrouped'), 'dragover'); fire(chip('Ungrouped'), 'drop'); await sleep(10)
  ok('drop on Ungrouped removes group', saved() === 'a2@A,a3@A,u1@B,a1@B,b1', saved())
  drag(chip('B'), chip('A'), -1); await sleep(10)
  ok('drag group before another moves its tags', saved() === 'u1@B,a1@B,a2@A,a3@A,b1' && chipText().startsWith('All:5* B:2 A:2'), `${saved()} ${chipText()}`)
  const e = fire(chip('All'), 'dragover')
  ok('All chip is not a drop target', !e.defaultPrevented)
  let leaked = false
  host.addEventListener('drop', () => { leaked = true })
  open('A')
  drag(row('a2'), row('a3'), 0, 1); await sleep(10)
  ok('drop does not bubble to the terminal host', !leaked)

  // closing: outside click, Escape; chip click does not count as outside
  mouse(chip('B'), 'mousedown')
  ok('mousedown on a chip leaves the menu to the chip', !!tagMenu())
  mouse(p.draft, 'mousedown')
  ok('click elsewhere closes the menu', !tagMenu())
  open('A')
  tagMenu().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  ok('Escape closes the menu', !tagMenu())

  // collapse: chips and the menu must not collapse or expand the sender
  const collapsed = () => host.classList.contains('ai-terminal-sender-collapsed')
  const press = el => { mouse(el, 'mousedown'); el.focus(); mouse(el, 'mouseup'); el.click() }
  p.draft.value = ''; p.draft.blur(); p.senderForceOpen = false; p.updateSenderState()
  ok('empty sender collapsed', collapsed())
  press(chip('B'))
  ok('chip click while collapsed keeps it collapsed and opens the menu', collapsed() && !!tagMenu())
  p.closeTagMenu()
  p.draft.focus(); p.updateSenderState()
  ok('focused draft expands', !collapsed())
  press(chip('A'))
  ok('chip click while expanded keeps it expanded', !collapsed())
  mouse(row('a2'), 'mousedown'); row('a2').focus()
  ok('pressing in the menu keeps the sender open', !collapsed() && !!tagMenu())
  await sleep(5)
  mouse(document.body, 'mousedown')
  ok('click outside collapses the sender and closes the menu', collapsed() && !tagMenu())
  p.draft.focus(); p.updateSenderState()
  p.draft.blur()
  ok('draft blur to outside collapses it', collapsed())
  open('A')
  row('a3').click()
  ok('tag click inserts and expands', !collapsed() && p.draft.value === 'a3')
  open('A')
  p.destroy()
  ok('destroy removes the menu', !tagMenu())
  ok('destroy removes the document listener', (() => { p.senderForceOpen = true; mouse(document.body, 'mousedown'); return p.senderForceOpen === true })())

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
  process.exit(failed ? 1 : 0)
})().catch(e => { console.log('ERROR', e); process.exit(1) })
