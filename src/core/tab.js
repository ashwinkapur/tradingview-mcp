/**
 * Core tab management logic.
 * Controls TradingView Desktop tabs via CDP and Electron keyboard shortcuts.
 */
import { getClient, evaluate, reattach, evaluateOnTarget } from '../connection.js';

const CDP_HOST = 'localhost';
const CDP_PORT = 9222;
const SYMBOL_JS = 'window.TradingViewApi.activeChart().symbol()';

/**
 * List all open chart tabs (CDP page targets).
 * Pass { withSymbols: true } to also read each tab's current symbol (one
 * throwaway CDP connection per tab, in parallel).
 */
export async function list({ withSymbols = false } = {}) {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  const targets = await resp.json();

  const tabs = targets
    .filter(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
    .map((t, i) => ({
      index: i,
      id: t.id,
      title: t.title.replace(/^Live stock.*charts on /, ''),
      url: t.url,
      chart_id: t.url.match(/\/chart\/([^/?]+)/)?.[1] || null,
    }));

  if (withSymbols) {
    await Promise.all(tabs.map(async (t) => {
      try { t.symbol = await evaluateOnTarget(t.id, SYMBOL_JS); }
      catch { t.symbol = null; }
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
 * Switch to a tab by index. Re-points the persistent CDP client at the new
 * target (so reads/controls follow) AND brings it to OS focus.
 */
export async function switchTab({ index }) {
  const tabs = await list();
  const idx = Number(index);

  if (idx >= tabs.tab_count) {
    throw new Error(`Tab index ${idx} out of range (have ${tabs.tab_count} tabs)`);
  }

  const target = tabs.tabs[idx];
  try { await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/activate/${target.id}`); } catch {}
  await reattach(target.id);

  let symbol = null;
  try { symbol = await evaluate(SYMBOL_JS); } catch {}
  return { success: true, action: 'switched', index: idx, tab_id: target.id, chart_id: target.chart_id, symbol };
}

/**
 * Switch to the tab currently displaying a given symbol. Reads every tab's
 * symbol, re-points the persistent CDP client at the first match, and brings
 * it to OS focus. Match is case-insensitive on either the full ticker
 * (NASDAQ:AUGO) or the bare ticker (AUGO).
 */
export async function switchToSymbol({ symbol }) {
  if (!symbol) throw new Error('symbol is required');
  const want = String(symbol).toUpperCase();
  const wantBare = want.split(':').pop();
  const tabs = await list();

  const matches = [];
  await Promise.all(tabs.tabs.map(async (t) => {
    let sym = null;
    try { sym = await evaluateOnTarget(t.id, SYMBOL_JS); } catch {}
    if (!sym) return;
    const u = String(sym).toUpperCase();
    if (u === want || u.split(':').pop() === wantBare) matches.push({ ...t, symbol: sym });
  }));

  if (matches.length === 0) {
    throw new Error(`No open tab shows symbol "${symbol}". Use tab_list with_symbols=true to see what's open.`);
  }

  const target = matches[0];
  try { await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/activate/${target.id}`); } catch {}
  await reattach(target.id);

  let confirmed = null;
  try { confirmed = await evaluate(SYMBOL_JS); } catch {}
  return {
    success: true,
    action: 'switched',
    tab_id: target.id,
    chart_id: target.chart_id,
    symbol: confirmed,
    match_count: matches.length,
    other_matches: matches.slice(1).map(m => ({ id: m.id, chart_id: m.chart_id })),
  };
}
