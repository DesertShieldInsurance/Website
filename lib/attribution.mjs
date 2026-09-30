const keys = new Set(['utm_source','utm_medium','utm_campaign','utm_content','utm_term',
  'gclid','gbraid','wbraid','campaign_id','adgroup_id','keyword','matchtype','network']);
export function cleanAttribution(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (keys.has(key) && typeof value === 'string' && value.length <= 250 &&
        !/[\u0000-\u001f<>]/.test(value)) clean[key] = value;
  }
  if (typeof raw.landing_path === 'string' && /^\/[A-Za-z0-9/_-]*\.html$/.test(raw.landing_path) &&
      raw.landing_path.length <= 120) clean.landing_path = raw.landing_path;
  if (typeof raw.captured_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw.captured_at) &&
      Number.isFinite(Date.parse(raw.captured_at))) clean.captured_at = raw.captured_at;
  return clean;
}
