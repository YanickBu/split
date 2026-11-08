import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

test('every offline asset and manifest icon exists at the root',()=>{
  const root=new URL('../',import.meta.url).pathname;
  const sw=readFileSync(join(root,'sw.js'),'utf8');
  const assets=[...sw.matchAll(/'\.\/([^']+)'/g)].map(match=>match[1]);
  assert.ok(assets.includes('index.html'));
  assert.ok(assets.includes('js/vendor.js'));
  for(const asset of assets)assert.ok(existsSync(join(root,asset)),`${asset} is missing`);
  const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
  assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons)assert.ok(existsSync(join(root,icon.src)),`${icon.src} is missing`);
});
