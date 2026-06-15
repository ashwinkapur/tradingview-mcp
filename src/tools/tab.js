import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/tab.js';

export function registerTabTools(server) {
  server.tool('tab_list', 'List all open TradingView chart tabs. Each tab has a unique target_id (the only stable switch key). Pass with_symbols=true to also read each tab\'s symbol and layout_name (both non-unique filters). index is a positional display hint only — it is volatile, do not switch by it.', {
    with_symbols: z.coerce.boolean().optional().describe('Also read each tab\'s symbol + layout_name (slower: one CDP read per tab)'),
  }, async ({ with_symbols }) => {
    try { return jsonResult(await core.list({ withSymbols: !!with_symbols })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tab_new', 'Open a new chart tab', {}, async () => {
    try { return jsonResult(await core.newTab()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tab_close', 'Close the current chart tab', {}, async () => {
    try { return jsonResult(await core.closeTab()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tab_switch_target', 'Switch to a chart tab by its unique CDP target_id (from tab_list). THE canonical switch — re-points the MCP\'s read/control client at that exact tab and brings it to focus. Always use this to switch; resolve a symbol/layout filter to a target_id first.', {
    target_id: z.string().describe('Unique CDP target id from tab_list (the target_id field)'),
  }, async ({ target_id }) => {
    try { return jsonResult(await core.switchToTarget({ target_id })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tab_switch', 'DEPRECATED — switch to a chart tab by index. Index is volatile (activating a tab reorders the list), so this can land on the wrong tab. Prefer tab_switch_target with a target_id.', {
    index: z.coerce.number().describe('Tab index (0-based, from tab_list) — volatile, prefer target_id'),
  }, async ({ index }) => {
    try { return jsonResult(await core.switchTab({ index })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tab_switch_symbol', 'Switch to the tab showing a given symbol (e.g. "AUGO" or "NASDAQ:AUGO"), case-insensitive. This is a FILTER: if exactly one tab matches it switches; if several match it returns the candidate list (each with target_id) and does NOT switch — pick one and call tab_switch_target.', {
    symbol: z.string().describe('Ticker to match, full (NASDAQ:AUGO) or bare (AUGO), case-insensitive'),
  }, async ({ symbol }) => {
    try { return jsonResult(await core.switchToSymbol({ symbol })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tab_switch_layout', 'Switch to the tab whose saved-layout name matches a string (emoji/punctuation/case-insensitive substring match, e.g. "Claude" matches "😎0 - Claude"). This is a FILTER: if exactly one tab matches it switches; if several match it returns the candidate list (each with target_id) and does NOT switch — pick one and call tab_switch_target.', {
    name: z.string().describe('Layout name (or substring) to match, e.g. "Claude" or "OK Quad"'),
  }, async ({ name }) => {
    try { return jsonResult(await core.switchToLayout({ name })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
