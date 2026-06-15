import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/drawing.js';

export function registerDrawingTools(server) {
  server.tool('draw_shape', 'Draw a shape/line on the chart', {
    shape: z.string().describe('Shape type: horizontal_line, vertical_line, trend_line, rectangle, text'),
    point: z.object({ time: z.coerce.number(), price: z.coerce.number() }).describe('{ time: unix_timestamp, price: number }'),
    point2: z.object({ time: z.coerce.number(), price: z.coerce.number() }).optional().describe('Second point for two-point shapes (trend_line, rectangle)'),
    overrides: z.string().optional().describe('JSON string of style overrides (e.g., \'{"linecolor": "#ff0000", "linewidth": 2}\')'),
    text: z.string().optional().describe('Text content for text shapes'),
  }, async ({ shape, point, point2, overrides, text }) => {
    try { return jsonResult(await core.drawShape({ shape, point, point2, overrides, text })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_list', 'List all shapes/drawings on the chart. Pass detailed=true to also get each drawing\'s first-point price and line style/color/width in the same call (no need for a draw_get_properties per shape).', {
    detailed: z.coerce.boolean().optional().describe('Also return price + linecolor/linewidth/linestyle per drawing'),
  }, async ({ detailed }) => {
    try { return jsonResult(await core.listDrawings({ detailed: !!detailed })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_set_properties', 'Edit an existing drawing\'s style by entity_id (e.g. make a horizontal ray dashed, recolor it). overrides is the set of properties to change — linestyle (0=solid, 1=dotted, 2=dashed), linecolor (e.g. "rgba(242,54,69,1)"), linewidth, etc. Returns the resulting line props.', {
    entity_id: z.string().describe('Entity ID of the drawing to edit (from draw_list)'),
    overrides: z.union([z.string(), z.record(z.string(), z.any())]).describe('Properties to set: object or JSON string, e.g. {"linestyle":2} or {"linecolor":"rgba(76,175,80,1)","linewidth":2}'),
  }, async ({ entity_id, overrides }) => {
    try { return jsonResult(await core.setProperties({ entity_id, overrides })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_clear', 'Remove all drawings from the chart', {}, async () => {
    try { return jsonResult(await core.clearAll()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_remove_one', 'Remove a specific drawing by entity ID', {
    entity_id: z.string().describe('Entity ID of the drawing to remove (from draw_list)'),
  }, async ({ entity_id }) => {
    try { return jsonResult(await core.removeOne({ entity_id })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_get_properties', 'Get properties and points of a specific drawing', {
    entity_id: z.string().describe('Entity ID of the drawing (from draw_list)'),
  }, async ({ entity_id }) => {
    try { return jsonResult(await core.getProperties({ entity_id })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
