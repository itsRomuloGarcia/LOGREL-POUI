// Prints do comunicado: Chrome headless pelo protocolo de depuracao (sem bibliotecas).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const PERFIL = process.argv[3];
mkdirSync(OUT, { recursive: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9334', `--user-data-dir=${PERFIL}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let alvo;
for (let i = 0; i < 40 && !alvo; i++) {
  await espera(500);
  try {
    const l = await (await fetch('http://127.0.0.1:9334/json')).json();
    alvo = l.find((t) => t.type === 'page');
  } catch {}
}
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
const erros = [];
ws.onmessage = (m) => {
  const o = JSON.parse(m.data);
  if (o.id && pend.has(o.id)) {
    pend.get(o.id)(o);
    pend.delete(o.id);
  } else if (o.method === 'Runtime.exceptionThrown') erros.push(o.params.exceptionDetails.exception?.description || o.params.exceptionDetails.text);
  else if (o.method === 'Runtime.consoleAPICalled' && o.params.type === 'error') erros.push(o.params.args.map((a) => a.value || a.description).join(' '));
};
const cmd = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    pend.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const ev = async (expr) => {
  const o = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (o.result?.exceptionDetails) throw new Error(expr + ' -> ' + JSON.stringify(o.result.exceptionDetails));
  return o.result?.result?.value;
};
const ate = async (expr, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(expr)) return true;
    await espera(250);
  }
  throw new Error('tempo esgotado: ' + expr);
};
const tela = async (w, h) => cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1.5, mobile: false });
// print de um elemento (rolado para o topo da janela)
const shot = async (nome, sel, pad = 0) => {
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({block:'start'}); return true})()`);
  await espera(400);
  const r = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return {x:b.left+scrollX,y:b.top+scrollY,w:b.width,h:b.height}})()`);
  const o = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad, scale: 1 } });
  writeFileSync(join(OUT, nome), Buffer.from(o.result.data, 'base64'));
  console.log('ok', nome, Math.round(r.w), 'x', Math.round(r.h));
};
const faixa = async (nome, cont, topo, fim, pad = 12) => {
  await ev(`(()=>{window.scrollTo(0,0); return true})()`);
  await espera(600);
  const r = await ev(`(()=>{const c=${cont}.getBoundingClientRect(); const a=${topo}.getBoundingClientRect(); const b=${fim}; return {x:c.left+scrollX,w:c.width,y:a.top+scrollY-${pad},h:b-a.top+${2 * pad}}})()`);
  const o = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
  writeFileSync(join(OUT, nome), Buffer.from(o.result.data, 'base64'));
  console.log('ok', nome, Math.round(r.w), 'x', Math.round(r.h));
};
const clica = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) throw new Error('sem ${sel.replace(/'/g, '')}'); e.click(); return true})()`);
const linhaDe = (ped, item) => `(()=>{const t=[...document.querySelectorAll('tbody tr[data-id]')].find(tr=>tr.textContent.includes('${ped}/${item}')); if(!t) throw new Error('sem linha ${ped}'); t.click(); return true})()`;

