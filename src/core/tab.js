/**
 * Core tab management logic.
 * Controls TradingView Desktop tabs via CDP and Electron keyboard shortcuts.
 *
 * Identity rule: the ONLY stable, unique per-tab key is the CDP target id
 * (`target_id`). Layout name and symbol are non-unique FILTERS, never selectors
 * — the same saved layout can be open in many tabs, and a symbol can appear in
 * many tabs. Switching always resolves to a target id; filters that match more
 * than one tab refuse to guess and return the candidate list instead.
 */
import { getClient, evaluate, reattach, evaluateOnTarget } from '../connection.js';

const CDP_HOST = 'localhost';
const CDP_PORT = 9222;
const SYMBOL_JS = 'window.TradingViewApi.activeChart().symbol()';

// Combined per-tab read: symbol + saved-layout name in one round-trip.
// Returns a JSON string so a single returnByValue eval yields both fields.
const SCAN_JS = `(function(){var a=window.TradingViewApi,s=null,l=null;
  try{s=a.activeChart().symbol();}catch(e){s=null;}
  try{l=a.layoutName&&a.layoutName();}catch(e){l=null;}
  return JSON.stringify({symbol:s,layout:l});})()`;

/**
 * Read one tab's symbol + layout_name via a throwaway CDP connection.
 * Never throws — returns nulls on failure.
 */
async function scanTab(id) {
  try {
    const raw = await evaluateOnTarget(id, SCAN_JS);
    const { symbol, layout } = JSON.parse(raw);
    return { symbol: symbol ?? null, layout_name: layout ?? null };
  } catch {
    return { symbol: null, layout_name: null };
  }
}

/**
 * Normalize a layout name for tolerant matching: lowercase, strip everything
 * that isn't a letter or digit (drops emoji, punctuation, spaces). So
 * "😎0 - Claude" → "0claude".
 */
function normalizeLayout(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Activate a target (OS focus) and re-point the persistent CDP client at it,
 * then confirm the live symbol. Shared by every switch path.
 */
async function activateAndReattach(target) {
  try { await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/activate/${target.id}`); } catch {}
  await reattach(target.id);
  let symbol = null;
  try { symbol = await evaluate(SYMBOL_JS); } catch {}
  return symbol;
}

function candidate(t) {
  return { target_id: t.id, chart_id: t.chart_id, symbol: t.symbol ?? null, layout_name: t.layout_name ?? null };
}

/**
 * List all open chart tabs (CDP page targets).
 *
 * Always includes `target_id` (the unique key). Pass { withSymbols: true } to
 * also read each tab's current `symbol` and `layout_name` (one throwaway CDP
 * connection per tab, in parallel). `index` is a positional display hint only —
 * it is volatile (activating a tab reorders /json/list) and must NOT be used as
 * a switch key.
 */
export async function list({ withSymbols = false } = {}) {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  const targets = await resp.json();

  const tabs = targets
    .filter(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
    .map((t, i) => ({
      index: i,
      target_id: t.id,
      id: t.id, // back-compat alias; target_id is the canonical field
      title: t.title.replace(/^Live stock.*charts on /, ''),
      url: t.url,
      chart_id: t.url.match(/\/chart\/([^/?]+)/)?.[1] || null,
    }));

  if (withSymbols) {
    await Promise.all(tabs.map(async (t) => {
      const { symbol, layout_name } = await scanTab(t.id);
      t.symbol = symbol;
      t.layout_name = layout_name;
    }));
  }

  return { success: true, tab_count: tabs.length, tabs };
}

/**
 * Open a new chart tab via keyboard shortcut (Ctrl+T / Cmd+T).
 */
export async function newTab() {
  const c = await getClient();

  // Electron/TradingView Desktop uses Ctrl+T for new tab on macOS too
  // But some versions use Cmd+T
  const isMac = process.platform === 'darwin';
  const mod = isMac ? 4 : 2; // 4 = meta (Cmd), 2 = ctrl

  await c.Input.dispatchKeyEvent({
    type: 'keyDown',
    modifiers: mod,
    key: 't',
    code: 'KeyT',
    windowsVirtualKeyCode: 84,
  });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 't', code: 'KeyT' });

  await new Promise(r => setTimeout(r, 2000));

  // Verify a new tab appeared
  const state = await list();
  return { success: true, action: 'new_tab_opened', ...state };
}

/**
 * Close the current tab via keyboard shortcut (Ctrl+W / Cmd+W).
 */
export async function closeTab() {
  const before = await list();
  if (before.tab_count <= 1) {
    throw new Error('Cannot close the last tab. Use tv_launch to restart TradingView instead.');
  }

  const c = await getClient();
  const isMac = process.platform === 'darwin';
  const mod = isMac ? 4 : 2;

  await c.Input.dispatchKeyEvent({
    type: 'keyDown',
    modifiers: mod,
    key: 'w',
    code: 'KeyW',
    windowsVirtualKeyCode: 87,
  });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'w', code: 'KeyW' });

  await new Promise(r => setTimeout(r, 1000));

  const after = await list();
  return { success: true, action: 'tab_closed', tabs_before: before.tab_count, tabs_after: after.tab_count };
}

/**
 * THE canonical switch: re-point the persistent CDP client at a tab by its
 * unique CDP target id. Confirms the id exists, activates it (OS focus),
 * reattaches, and confirms the live symbol.
 */
export async function switchToTarget({ target_id }) {
  if (!target_id) throw new Error('target_id is required');
  const tabs = await list();
  const target = tabs.tabs.find(t => t.target_id === target_id);
  if (!target) {
    throw new Error(`No open tab with target_id "${target_id}". Use tab_list to see current target ids.`);
  }
  const symbol = await activateAndReattach(target);
  return { success: true, action: 'switched', target_id: target.target_id, chart_id: target.chart_id, symbol };
}

/**
 * Switch to a tab by index. DEPRECATED — index is positional and volatile
 * (activating any tab reorders /json/list, so indices drift between calls).
 * Resolves against a fresh list and steers callers to tab_switch_target.
 */
export async function switchTab({ index }) {
  const tabs = await list();
  const idx = Number(index);

  if (idx >= tabs.tab_count || idx < 0) {
    throw new Error(`Tab index ${idx} out of range (have ${tabs.tab_count} tabs)`);
  }

  const target = tabs.tabs[idx];
  const symbol = await activateAndReattach(target);
  return {
    success: true,
    action: 'switched',
    deprecated: 'index is volatile; prefer tab_switch_target with target_id',
    index: idx,
    target_id: target.target_id,
    chart_id: target.chart_id,
    symbol,
  };
}

/**
 * Switch to the tab currently displaying a given symbol. FILTER, not a
 * selector: if exactly one tab matches it switches; if more than one matches it
 * REFUSES to guess and returns the candidate list (each with target_id). Match
 * is case-insensitive on either the full ticker (NASDAQ:AUGO) or the bare
 * ticker (AUGO).
 */
export async function switchToSymbol({ symbol }) {
  if (!symbol) throw new Error('symbol is required');
  const want = String(symbol).toUpperCase();
  const wantBare = want.split(':').pop();
  const tabs = await list();

  const matches = [];
  await Promise.all(tabs.tabs.map(async (t) => {
    const { symbol: sym, layout_name } = await scanTab(t.id);
    if (!sym) return;
    t.symbol = sym;
    t.layout_name = layout_name;
    const u = String(sym).toUpperCase();
    if (u === want || u.split(':').pop() === wantBare) matches.push(t);
  }));

  if (matches.length === 0) {
    throw new Error(`No open tab shows symbol "${symbol}". Use tab_list with_symbols=true to see what's open.`);
  }

  if (matches.length > 1) {
    return {
      success: false,
      ambiguous: true,
      reason: `Symbol "${symbol}" is open in ${matches.length} tabs. Pick one and use tab_switch_target.`,
      candidates: matches.map(candidate),
    };
  }

  const target = matches[0];
  const confirmed = await activateAndReattach(target);
  return {
    success: true,
    action: 'switched',
    target_id: target.target_id,
    chart_id: target.chart_id,
    symbol: confirmed,
    layout_name: target.layout_name,
  };
}

/**
 * Switch to the tab whose saved-layout name matches `name`. FILTER, not a
 * selector: matching is emoji/punct/case-insensitive substring (normalized).
 * Exactly one match → switch; more than one → refuse and return candidates;
 * zero → clear error.
 */
export async function switchToLayout({ name }) {
  if (!name) throw new Error('name is required');
  const want = normalizeLayout(name);
  if (!want) throw new Error(`Layout name "${name}" normalizes to empty; provide letters or digits.`);
  const tabs = await list();

  const matches = [];
  await Promise.all(tabs.tabs.map(async (t) => {
    const { symbol, layout_name } = await scanTab(t.id);
    t.symbol = symbol;
    t.layout_name = layout_name;
    if (layout_name && normalizeLayout(layout_name).includes(want)) matches.push(t);
  }));

  if (matches.length === 0) {
    throw new Error(`No open tab has a layout matching "${name}". Use tab_list with_symbols=true to see open layouts.`);
  }

  if (matches.length > 1) {
    return {
      success: false,
      ambiguous: true,
      reason: `Layout "${name}" matches ${matches.length} tabs. Pick one and use tab_switch_target.`,
      candidates: matches.map(candidate),
    };
  }

  const target = matches[0];
  const confirmed = await activateAndReattach(target);
  return {
    success: true,
    action: 'switched',
    target_id: target.target_id,
    chart_id: target.chart_id,
    symbol: confirmed,
    layout_name: target.layout_name,
  };
}
