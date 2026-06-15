import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/tab.js';

export function registerTabTools(server) {
  server.tool('tab_list', 'List all open TradingView chart tabs. Pass with_symbols=true to also read each tab\'s current symbol.', {
    with_symbols: z.coerce.boolean().optional().describe('Also read each tab\'s symbol (slower: one CDP read per tab)'),
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

  server.tool('tab_switch', 'Switch to a chart tab by index. Re-points the MCP\'s read/control client at that tab (reads follow) and brings it to focus.', {
    index: z.coerce.number().describe('Tab index (0-based, from tab_list)'),
  }, async ({ index }) => {
    try { return jsonResult(await core.switchTab({ index })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('tab_switch_symbol', 'Switch to the tab currently showing a given symbol (e.g. "AUGO" or "NASDAQ:AUGO"). Re-points the MCP\'s read/control client at that tab and brings it to focus. This is the reliable way to target a specific chart when many tabs are open.', {
    symbol: z.string().describe('Ticker to match, full (NASDAQ:AUGO) or bare (AUGO), case-insensitive'),
  }, async ({ symbol }) => {
    try { return jsonResult(await core.switchToSymbol({ symbol })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
