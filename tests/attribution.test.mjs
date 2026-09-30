import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAttribution } from '../lib/attribution.mjs';
import { readFile } from 'node:fs/promises';
test('campaign sanitizer permits bounded marketing identifiers, not arbitrary or sensitive fields',()=>{
  assert.deepEqual(cleanAttribution({utm_campaign:'az-trucking',gclid:'test-click',email:'private@example.invalid',
    driver_license:'private',utm_term:'<script>',keyword:'x'.repeat(251)}),
    {utm_campaign:'az-trucking',gclid:'test-click'});
  assert.deepEqual(cleanAttribution({landing_path:'/quote-trucking.html',captured_at:'2026-09-30T17:00:00.000Z'}),
    {landing_path:'/quote-trucking.html',captured_at:'2026-09-30T17:00:00.000Z'});
  assert.deepEqual(cleanAttribution({landing_path:'/intake#private-token',captured_at:'bad'}),{});
});
test('secure intake still has no third-party advertising tags',async()=>{
  const html=await readFile(new URL('../client-intake.html',import.meta.url),'utf8');
  assert.ok(html.includes('/assets/js/attribution.js'));
  assert.ok(!html.includes('googletagmanager.com')&&!html.includes('fbevents.js'));
});
