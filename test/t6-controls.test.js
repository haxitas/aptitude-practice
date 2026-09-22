import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../js/tests/t6.js';
import { DEFAULTS, loadSettings } from '../js/core/settings.js';

test('左右ボタンはt6.stickSideだけを保存し、次回読込で維持・保存失敗時は元の側と成績を保つ', t => {
  const previous = new Map();
  for (const [key,value] of Object.entries({ innerWidth:1180, innerHeight:820, addEventListener(){}, removeEventListener(){} })) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  t.after(()=>{for(const [key,descriptor] of previous) {
    if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
  }});
  const nodes=new Map();
  const root={innerHTML:'',querySelector(selector) {
    if(!nodes.has(selector)) nodes.set(selector,{textContent:'',hidden:false,disabled:false,clientWidth:1162,clientHeight:720,
      handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},focus(){}});
    return nodes.get(selector);
  }};
  const records='{"records": [ {"id":"old"} ]}';
  const values=new Map([['apt_results',records],['apt_settings',JSON.stringify({t2:{durationSec:90},t6:{moveSpeed:1.5}})]]);
  let fail=false;
  const store={ getItem:key=>values.get(key)??null,setItem(key,value){if(fail)throw new Error('容量不足');values.set(key,value);} };
  const cleanup=mount(root,{settings:DEFAULTS,store});
  const button=root.querySelector('[data-ref="side"]');
  button.handlers.click();
  assert.equal(loadSettings(store).settings.t6.stickSide,'left');
  assert.deepEqual(JSON.parse(values.get('apt_settings')),{t2:{durationSec:90},t6:{moveSpeed:1.5,stickSide:'left'}});
  assert.equal(values.get('apt_results'),records);
  const saved=values.get('apt_settings');
  fail=true;
  button.handlers.click();
  assert.equal(values.get('apt_settings'),saved);
  assert.equal(values.get('apt_results'),records);
  assert.match(root.querySelector('[data-ref="message"]').textContent,/容量不足/);
  assert.match(button.textContent,/左 → 右へ/);
  cleanup();
});
