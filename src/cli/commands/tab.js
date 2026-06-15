import { register } from '../router.js';
import * as core from '../../core/tab.js';

register('tab', {
  description: 'Tab management (list, new, close, switch-target, switch-symbol, switch-layout)',
  subcommands: new Map([
    ['list', {
      description: 'List all open chart tabs (pass --symbols to also read symbol + layout_name)',
      handler: (opts) => core.list({ withSymbols: !!(opts.symbols || opts['with-symbols']) }),
    }],
    ['new', {
      description: 'Open a new chart tab',
      handler: () => core.newTab(),
    }],
    ['close', {
      description: 'Close the current tab',
      handler: () => core.closeTab(),
    }],
    ['switch-target', {
      description: 'Switch to a tab by its unique CDP target_id (canonical switch)',
      handler: (opts, positionals) => {
        if (positionals[0] === undefined) throw new Error('target_id required. Usage: tv tab switch-target <target_id>');
        return core.switchToTarget({ target_id: positionals[0] });
      },
    }],
    ['switch-symbol', {
      description: 'Switch to the tab showing a symbol (refuses if >1 match)',
      handler: (opts, positionals) => {
        if (positionals[0] === undefined) throw new Error('Symbol required. Usage: tv tab switch-symbol AUGO');
        return core.switchToSymbol({ symbol: positionals[0] });
      },
    }],
    ['switch-layout', {
      description: 'Switch to the tab whose saved-layout name matches (refuses if >1 match)',
      handler: (opts, positionals) => {
        if (positionals[0] === undefined) throw new Error('Layout name required. Usage: tv tab switch-layout Claude');
        return core.switchToLayout({ name: positionals[0] });
      },
    }],
    ['switch', {
      description: 'DEPRECATED — switch to a tab by volatile index; prefer switch-target',
      handler: (opts, positionals) => {
        if (positionals[0] === undefined) throw new Error('Index required. Usage: tv tab switch 0');
        return core.switchTab({ index: positionals[0] });
      },
    }],
  ]),
});
