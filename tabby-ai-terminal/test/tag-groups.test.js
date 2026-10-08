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
const runner = { run () { return { cancel () {} } }, getClaudeRunSettings: () => ({ requested: 'plan', mode: 'plan' }) }
let menu = null, boxes = [], decide = 0
const platform = { showMessageBox: async o => { boxes.push(o); return { response: decide } }, setClipboard () {}, popupContextMenu: items => { menu = items } }
const p = new AITerminalPanel(tab, auth, runner, config, platform)
host.append(p.element, p.senderElement)

const bar = () => p.savedGroupBar
const selector = () => bar().querySelector('.ai-group-selector')
const selectorText = () => selector() ? `${selector().querySelector('.ai-saved-group-name').textContent}:${selector().querySelector('.ai-saved-group-count').textContent}` : ''
const groupMenu = () => document.querySelector('.ai-group-menu')
const openGroups = () => { if (!groupMenu()) selector().click() }
const rows = () => (groupMenu() ? [...groupMenu().querySelectorAll('.ai-group-menu-item')] : [])
const rowText = () => rows().filter(r => !r.classList.contains('is-empty')).map(r => `${r.querySelector('.ai-group-menu-name').textContent}:${r.querySelector('.ai-group-menu-count').textContent}${r.classList.contains('is-active') ? '*' : ''}`).join(' ')
const groupRow = name => { openGroups(); return rows().find(r => r.querySelector('.ai-group-menu-name').textContent === name) }
const show = name => groupRow(name).click()
const tabs = () => [...p.savedCommandTabs.querySelectorAll('.ai-saved-command-tab')].map(t => t.textContent)
const tabEl = label => [...p.savedCommandTabs.querySelectorAll('.ai-saved-command-tab')].find(t => t.textContent === label)
const saved = () => store.aiTerminal.savedSenderCommands.map(i => `${i.name || i.command}${i.group ? '@' + i.group : ''}`).join(',')
const fire = (el, type, clientX = 0, clientY = 0) => { const e = new dom.window.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'clientX', { value: clientX }); Object.defineProperty(e, 'clientY', { value: clientY }); el.dispatchEvent(e); return e }
const drag = (src, dst, clientX = 0, clientY = 0) => { fire(src, 'dragstart'); fire(dst, 'dragover', clientX, clientY); fire(dst, 'drop', clientX, clientY); fire(src, 'dragend') }
const menuItem = label => menu.find(i => i.label === label)
const dialog = () => document.querySelector('.ai-sender-tag-editor-overlay')
const mouse = (el, type) => el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true }))

;(async () => {
  // no groups: tag row only
  p.renderSavedCommandTabs()
  ok('no tags: hint in the tag row', p.savedCommandTabs.textContent.includes('No saved tags yet'))
  store.aiTerminal.savedSenderCommands = [{ name: '5000 upgrade', command: 'sysupgrade /tmp/fw.bin' }, { name: 'check Wi-Fi', command: 'iwconfig' }]
  p.renderSavedCommandTabs()
  ok('no groups: no group selector, all tags in the row', bar().hidden && !selector() && tabs().join('|') === '5000 upgrade|check Wi-Fi')

  // save a tag with a group through the editor
  p.draft.value = 'fw_printenv'
  p.openSenderTagEditor()
  let inputs = dialog().querySelectorAll('input')
  ok('editor has Name and Group inputs', inputs.length === 2 && dialog().textContent.includes('Group (optional)'))
  inputs[0].value = '5000 env'; inputs[1].value = '  EAP5000  '
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Save').click()
  await sleep(10)
  ok('saved with trimmed group', saved() === '5000 upgrade,check Wi-Fi,5000 env@EAP5000', saved())
  ok('one group selector appears, showing All', !bar().hidden && bar().querySelectorAll('.ai-saved-group-chip').length === 1 && selectorText() === 'All:3', selectorText())
  ok('chip bar is not hidden once groups exist (Bootstrap hides [hidden] with !important)', !bar().closest('[hidden]'))

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
  openGroups()
  ok('selector opens the group list on document.body, upwards', !!groupMenu() && groupMenu().parentElement === document.body && groupMenu().style.bottom.endsWith('px') && selector().classList.contains('is-active'))
  ok('list: All, groups in first-appearance order, Ungrouped, with counts; reserved name ignored', rowText() === 'All:6* AP:2 EAP5000:2 Ungrouped:2', rowText())
  selector().click()
  ok('clicking the selector again closes the list', !groupMenu())

  // filter
  show('AP')
  ok('choosing a group shows its tags and closes the list', tabs().join('|') === 'ap1|ap2' && selectorText() === 'AP:2' && !groupMenu())
  ok('filter persisted', store.aiTerminal.senderGroupFilter === 'AP' && saves > 0)
  ok('selector takes the group color', selector().style.getPropertyValue('--ai-group-color') !== '')
  show('Ungrouped')
  ok('Ungrouped filter', tabs().join('|') === 'u1|bad' && selectorText() === 'Ungrouped:2')
  show('All')
  ok('All filter', tabs().length === 6)

  // editor defaults to the shown group
  show('EAP5000')
  p.draft.value = 'reboot'
  p.openSenderTagEditor()
  inputs = dialog().querySelectorAll('input')
  ok('new tag defaults to the shown group', inputs[1].value === 'EAP5000')
  ok('group suggestions listed', [...dialog().querySelectorAll('datalist option')].map(o => o.value).join(',') === 'AP,EAP5000')
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Save').click()
  await sleep(10)
  ok('new tag placed after its group', saved() === 'ap1@AP,u1,e1@EAP5000,ap2@AP,e2@EAP5000,reboot@EAP5000,bad', saved())
  ok('tag shown in the current filter', tabs().join('|') === 'e1|e2|reboot')
  p.draft.value = 'iw dev'
  p.openSenderTagEditor()
  dialog().querySelectorAll('input')[1].value = 'Wi-Fi'
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Save').click()
  await sleep(10)
  ok('saving into another group switches the filter to it', store.aiTerminal.senderGroupFilter === 'Wi-Fi' && tabs().join('|') === 'iw dev')

  // tag click inserts
  show('All')
  tabEl('u1').click()
  ok('tag click inserts the command', p.draft.value === 'cmd u1')

  // tag right-click: Edit / Move / Duplicate / Delete
  fire(tabEl('reboot'), 'contextmenu')
  ok('tag actions', menu.map(i => i.label || i.type).join('|') === 'Edit...|Move to group|Duplicate to group|separator|Delete', menu.map(i => i.label || i.type).join('|'))
  const move = menuItem('Move to group').submenu
  const dup = menuItem('Duplicate to group').submenu
  ok('Move: own group disabled', move.map(i => i.label || i.type).join('|') === 'AP|EAP5000|Wi-Fi|separator|Ungrouped|New group...' && move.find(i => i.label === 'EAP5000').enabled === false)
  ok('Duplicate: every group allowed, including its own', dup.map(i => i.label || i.type).join('|') === 'AP|EAP5000|Wi-Fi|separator|Ungrouped|New group...' && dup.every(i => i.type === 'separator' || i.enabled !== false))
  dup.find(i => i.label === 'AP').click(); await sleep(10)
  ok('Duplicate to group adds a copy at the end of that group and keeps the original', saved() === 'ap1@AP,u1,e1@EAP5000,ap2@AP,reboot@AP,e2@EAP5000,reboot@EAP5000,bad,iw dev@Wi-Fi', saved())
  fire(tabEl('u1'), 'contextmenu'); menuItem('Duplicate to group').submenu.find(i => i.label === 'Ungrouped').click(); await sleep(10)
  ok('Duplicate into its own group (Ungrouped) adds a second copy', saved().split(',').filter(x => x === 'u1').length === 2, saved())
  fire(tabEl('iw dev'), 'contextmenu'); menuItem('Duplicate to group').submenu.find(i => i.label === 'New group...').click()
  ok('Duplicate to a new group asks for the name', dialog() && dialog().textContent.includes('Duplicate to a new group'))
  dialog().querySelector('input').value = 'Lab'
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Duplicate').click(); await sleep(10)
  ok('copy lands in the new group', saved().includes('iw dev@Wi-Fi') && saved().endsWith('iw dev@Lab'), saved())
  fire(tabEl('iw dev'), 'contextmenu'); menuItem('Move to group').submenu.find(i => i.label === 'AP').click(); await sleep(10)
  ok('Move to group moves the tag', saved().includes('iw dev@AP') && !saved().includes('iw dev@Wi-Fi'), saved())
  fire(tabEl('iw dev'), 'contextmenu'); menuItem('Edit...').click()
  ok('Edit opens the editor', !!dialog() && dialog().querySelectorAll('input')[1].value === 'AP')
  p.closeSenderTagEditor()
  const before = store.aiTerminal.savedSenderCommands.length
  fire(tabEl('bad'), 'contextmenu'); menuItem('Delete').click(); await sleep(10)
  ok('Delete removes the tag', store.aiTerminal.savedSenderCommands.length === before - 1 && !saved().includes('bad'))
  const keep = store.aiTerminal.savedSenderCommands
  store.aiTerminal.savedSenderCommands = [...keep, ...Array.from({ length: 100 - keep.length }, (_, i) => ({ command: `fill${i}` }))]
  p.renderSavedCommandTabs()
  fire(tabEl('u1'), 'contextmenu')
  ok('Duplicate is disabled at the tag limit', menuItem('Duplicate to group (100 tags max)')?.enabled === false, menu.map(i => i.label).join('|'))
  store.aiTerminal.savedSenderCommands = keep
  p.renderSavedCommandTabs()

  // group actions from the list (and from the selector)
  store.aiTerminal.savedSenderCommands = store.aiTerminal.savedSenderCommands.filter(i => !(i.group === 'AP' && ['reboot', 'iw dev'].includes(i.name || i.command)))
  p.renderSavedCommandTabs()
  fire(groupRow('AP'), 'contextmenu')
  ok('group menu items', menu.map(i => i.label || i.type).join('|') === 'Insert all into Sender (2)|separator|Rename group...|Color|Delete group', menu.map(i => i.label || i.type).join('|'))
  store.aiTerminal.senderVariables = { ip: '10.0.0.1' }
  menu[0].click()
  inputs = dialog().querySelectorAll('input')
  ok('one dialog for the union of variables, remembered value prefilled', inputs.length === 2 && inputs[0].value === '10.0.0.1' && inputs[1].value === '')
  inputs[1].value = '22'
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Insert').click()
  ok('group inserted line by line with values', p.draft.value === 'cmd ap1\ncmd ap2 10.0.0.1 22' && !dialog(), JSON.stringify(p.draft.value))
  show('EAP5000')
  fire(selector(), 'contextmenu')
  ok('right-click on the selector opens the shown group actions', menu[0].label === 'Insert all into Sender (3)' && menu.some(i => i.label === 'Rename group...'))
  fire(groupRow('Ungrouped'), 'contextmenu')
  ok('Ungrouped: insert only', menu.length === 1 && menu[0].label.startsWith('Insert all into Sender'))

  // rename and delete
  fire(groupRow('AP'), 'contextmenu'); menuItem('Rename group...').click()
  dialog().querySelector('input').value = 'AP-common'
  dialog().querySelector('input').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(10)
  ok('renamed', saved().includes('ap1@AP-common') && !!groupRow('AP-common'))
  fire(groupRow('EAP5000'), 'contextmenu'); menuItem('Rename group...').click()
  dialog().querySelector('input').value = 'AP-common'
  ;[...dialog().querySelectorAll('button')].find(b => b.textContent === 'Rename').click(); await sleep(10)
  ok('rename to an existing group merges; the shown group follows', !groupRow('EAP5000') && groupRow('AP-common').querySelector('.ai-group-menu-count').textContent === '5' && store.aiTerminal.senderGroupFilter === 'AP-common', rowText())
  decide = 1
  fire(groupRow('AP-common'), 'contextmenu'); menuItem('Delete group').click(); await sleep(10)
  ok('delete asks, Cancel keeps the group', boxes.at(-1).message === 'Delete group "AP-common"?' && !!groupRow('AP-common'))
  decide = 0
  fire(groupRow('Lab'), 'contextmenu'); menuItem('Delete group').click(); await sleep(10)
  ok('delete moves its tags to Ungrouped', !groupRow('Lab') && saved().split(',').includes('iw dev'), saved())

  // drag: tag row (horizontal), tags onto groups in the list, groups in the list (vertical)
  store.aiTerminal.savedSenderCommands = [
    { name: 'a1', command: 'a1', group: 'A' }, { name: 'a2', command: 'a2', group: 'A' }, { name: 'a3', command: 'a3', group: 'A' },
    { name: 'b1', command: 'b1', group: 'B' }, { name: 'u1', command: 'u1' },
  ]
  store.aiTerminal.senderGroupFilter = ''
  p.closeGroupMenu()
  p.renderSavedCommandTabs()
  ok('tags and group rows draggable, All is not', tabEl('a1').draggable === true && groupRow('A').draggable === true && groupRow('All').draggable === false)
  drag(tabEl('a3'), tabEl('a1'), -1); await sleep(10)
  ok('drop before (horizontal)', saved() === 'a3@A,a1@A,a2@A,b1@B,u1', saved())
  drag(tabEl('a3'), tabEl('a2'), 1); await sleep(10)
  ok('drop after', saved() === 'a1@A,a2@A,a3@A,b1@B,u1', saved())
  drag(tabEl('u1'), tabEl('b1'), -1); await sleep(10)
  ok('drop on a tag of another group joins it', saved() === 'a1@A,a2@A,a3@A,u1@B,b1@B', saved())
  ok('list still open while dragging tags', !!groupMenu())
  drag(tabEl('a1'), groupRow('B')); await sleep(10)
  ok('drop on a group in the list moves the tag to the end of it', saved() === 'a2@A,a3@A,u1@B,b1@B,a1@B', saved())
  ok('empty Ungrouped hidden when idle', groupRow('Ungrouped').classList.contains('is-empty'))
  fire(tabEl('b1'), 'dragstart')
  ok('Ungrouped revealed while dragging a tag', groupMenu().classList.contains('is-dragging-tag'))
  fire(groupRow('Ungrouped'), 'dragover'); fire(groupRow('Ungrouped'), 'drop'); await sleep(10)
  ok('drop on Ungrouped removes the group', saved() === 'a2@A,a3@A,u1@B,a1@B,b1', saved())
  drag(groupRow('B'), groupRow('A'), 0, -1); await sleep(10)
  ok('drag a group above another moves its tags (vertical)', saved() === 'u1@B,a1@B,a2@A,a3@A,b1' && rowText().startsWith('All:5* B:2 A:2'), `${saved()} ${rowText()}`)
  ok('drag classes cleared', !document.querySelector('.is-dragging, .is-drop-before, .is-drop-after, .is-drop-target'))
  let leaked = false
  host.addEventListener('drop', () => { leaked = true })
  drag(tabEl('a2'), tabEl('a3'), 1); await sleep(10)
  ok('drop does not bubble to the terminal host', !leaked)

  // closing the list
  mouse(tabEl('a2'), 'mousedown')
  ok('pressing a tag keeps the list open (tags can be dropped on groups)', !!groupMenu())
  mouse(p.draft, 'mousedown')
  ok('click elsewhere closes the list', !groupMenu())
  openGroups()
  groupMenu().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  ok('Escape closes the list', !groupMenu())

  // collapse: selector, list and tags must not collapse or expand the sender
  const collapsed = () => host.classList.contains('ai-terminal-sender-collapsed')
  const press = el => { mouse(el, 'mousedown'); el.focus(); mouse(el, 'mouseup'); el.click() }
  p.draft.value = ''; p.draft.blur(); p.senderForceOpen = false; p.updateSenderState()
  ok('empty sender collapsed', collapsed())
  press(selector())
  ok('selector click while collapsed keeps it collapsed and opens the list', collapsed() && !!groupMenu())
  press(groupRow('B'))
  ok('choosing a group while collapsed keeps it collapsed', collapsed() && store.aiTerminal.senderGroupFilter === 'B')
  p.draft.focus(); p.updateSenderState()
  ok('focused draft expands', !collapsed())
  press(selector())
  ok('selector click while expanded keeps it expanded', !collapsed())
  await sleep(5)
  mouse(document.body, 'mousedown')
  ok('click outside collapses the sender and closes the list', collapsed() && !groupMenu())
  press(tabEl('u1'))
  ok('tag click inserts and expands', !collapsed() && p.draft.value === 'u1')
  openGroups()
  p.destroy()
  ok('destroy removes the list', !groupMenu())
  ok('destroy removes the document listener', (() => { p.senderForceOpen = true; mouse(document.body, 'mousedown'); return p.senderForceOpen === true })())

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
  process.exit(failed ? 1 : 0)
})().catch(e => { console.log('ERROR', e); process.exit(1) })
