/**
 * Core drawing logic.
 */
import { evaluate as _evaluate, getChartApi as _getChartApi, safeString, requireFinite } from '../connection.js';

function _resolve(deps) {
  return { evaluate: deps?.evaluate || _evaluate, getChartApi: deps?.getChartApi || _getChartApi };
}

export async function drawShape({ shape, point, point2, overrides: overridesRaw, text, _deps }) {
  const { evaluate, getChartApi } = _resolve(_deps);
  const overrides = overridesRaw ? (typeof overridesRaw === 'string' ? JSON.parse(overridesRaw) : overridesRaw) : {};
  const apiPath = await getChartApi();
  const overridesStr = JSON.stringify(overrides || {});
  const textStr = text ? JSON.stringify(text) : '""';

  const p1time = requireFinite(point.time, 'point.time');
  const p1price = requireFinite(point.price, 'point.price');

  const before = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);

  if (point2) {
    const p2time = requireFinite(point2.time, 'point2.time');
    const p2price = requireFinite(point2.price, 'point2.price');
    await evaluate(`
      ${apiPath}.createMultipointShape(
        [{ time: ${p1time}, price: ${p1price} }, { time: ${p2time}, price: ${p2price} }],
        { shape: ${safeString(shape)}, overrides: ${overridesStr}, text: ${textStr} }
      )
    `);
  } else {
    await evaluate(`
      ${apiPath}.createShape(
        { time: ${p1time}, price: ${p1price} },
        { shape: ${safeString(shape)}, overrides: ${overridesStr}, text: ${textStr} }
      )
    `);
  }

  await new Promise(r => setTimeout(r, 200));
  const after = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);
  const newId = (after || []).find(id => !(before || []).includes(id)) || null;
  const result = { entity_id: newId };
  return { success: true, shape, entity_id: result?.entity_id };
}

export async function listDrawings({ detailed = false } = {}) {
  const apiPath = await getChartApi();
  // Plain mode: just id + name (one cheap call). Detailed mode: also read each
  // shape's first-point price + line style/color/width in the SAME round-trip,
  // so callers don't need a draw_get_properties per shape.
  const shapes = detailed
    ? await evaluate(`
      (function() {
        var api = ${apiPath};
        return api.getAllShapes().map(function(s) {
          var a, pts, p;
          try { a = api.getShapeById(s.id); } catch(e) {}
          try { pts = a.getPoints(); } catch(e) {}
          try { p = a.getProperties(); } catch(e) {}
          return { id: s.id, name: s.name,
                   price: pts && pts[0] && pts[0].price,
                   linecolor: p && p.linecolor, linewidth: p && p.linewidth,
                   linestyle: p && p.linestyle };
        });
      })()
    `)
    : await evaluate(`
      (function() {
        var api = ${apiPath};
        var all = api.getAllShapes();
        return all.map(function(s) { return { id: s.id, name: s.name }; });
      })()
    `);
  return { success: true, count: shapes?.length || 0, shapes: shapes || [] };
}

export async function getProperties({ entity_id }) {
  const apiPath = await getChartApi();
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = ${safeString(entity_id)};
      var props = { entity_id: eid };
      var shape = api.getShapeById(eid);
      if (!shape) return { error: 'Shape not found: ' + eid };
      var methods = [];
      try { for (var key in shape) { if (typeof shape[key] === 'function') methods.push(key); } props.available_methods = methods; } catch(e) {}
      try { var pts = shape.getPoints(); if (pts) props.points = pts; } catch(e) { props.points_error = e.message; }
      try { var ovr = shape.getProperties(); if (ovr) props.properties = ovr; } catch(e) {
        try { var ovr2 = shape.properties(); if (ovr2) props.properties = ovr2; } catch(e2) { props.properties_error = e2.message; }
      }
      try { props.visible = shape.isVisible(); } catch(e) {}
      try { props.locked = shape.isLocked(); } catch(e) {}
      try { props.selectable = shape.isSelectionEnabled(); } catch(e) {}
      try {
        var all = api.getAllShapes();
        for (var i = 0; i < all.length; i++) { if (all[i].id === eid) { props.name = all[i].name; break; } }
      } catch(e) {}
      return props;
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, ...result };
}

export async function setProperties({ entity_id, overrides: overridesRaw }) {
  const apiPath = await getChartApi();
  const overrides = overridesRaw
    ? (typeof overridesRaw === 'string' ? JSON.parse(overridesRaw) : overridesRaw)
    : {};
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || !Object.keys(overrides).length) {
    throw new Error('overrides must be a non-empty object of properties to set (e.g. {"linestyle":2,"linecolor":"rgba(242,54,69,1)","linewidth":2})');
  }
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = ${safeString(entity_id)};
      var shape = api.getShapeById(eid);
      if (!shape) return { error: 'Shape not found: ' + eid };
      shape.setProperties(${JSON.stringify(overrides)});
      var p = {};
      try { p = shape.getProperties(); } catch(e) {}
      return { entity_id: eid, linecolor: p.linecolor, linewidth: p.linewidth, linestyle: p.linestyle };
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, ...result };
}

export async function removeOne({ entity_id }) {
  const apiPath = await getChartApi();
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = ${safeString(entity_id)};
      var before = api.getAllShapes();
      var found = false;
      for (var i = 0; i < before.length; i++) { if (before[i].id === eid) { found = true; break; } }
      if (!found) return { removed: false, error: 'Shape not found: ' + eid, available: before.map(function(s) { return s.id; }) };
      api.removeEntity(eid);
      var after = api.getAllShapes();
      var stillExists = false;
      for (var j = 0; j < after.length; j++) { if (after[j].id === eid) { stillExists = true; break; } }
      return { removed: !stillExists, entity_id: eid, remaining_shapes: after.length };
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, entity_id: result?.entity_id, removed: result?.removed, remaining_shapes: result?.remaining_shapes };
}

export async function clearAll() {
  const apiPath = await getChartApi();
  await evaluate(`${apiPath}.removeAllShapes()`);
  return { success: true, action: 'all_shapes_removed' };
}
