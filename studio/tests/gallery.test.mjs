import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { startGalleries } from '../../site/gallery.js';
import { createAnnotationPicker } from '../annotations.js';

test('comment mode lets gallery controls navigate and still selects images and Alt-clicked buttons', t => {
  const { document, window } = parseHTML(`<html><body>
    <figure data-gallery><img data-studio-node="photo" alt="Mökki">
      <button data-studio-node="next" data-gallery-step="1"><svg><path></path></svg></button>
    </figure></body></html>`);
  const previous = Object.fromEntries(['document', 'window', 'CSS', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  window.getSelection = () => ({ rangeCount: 0, isCollapsed: true, toString: () => '', removeAllRanges() {} });
  for (const target of document.querySelectorAll('[data-studio-node]')) target.getClientRects = () => [{}];
  Object.assign(globalThis, { document, window, CSS: { escape: value => value }, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  t.after(() => Object.assign(globalThis, previous));
  let selected;
  const picker = createAnnotationPicker({ editors: new Map(), getComments: () => new Map(), onPick: anchor => selected = anchor });
  picker.setEnabled(true);
  const send = (type, target, options = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, options); target.dispatchEvent(event); return event;
  };
  const arrow = document.querySelector('path');
  assert.equal(send('pointerdown', arrow).defaultPrevented, false);
  assert.equal(send('click', arrow).defaultPrevented, false);
  assert.equal(send('keydown', arrow, { key: 'Enter' }).defaultPrevented, false);
  assert.equal(selected, undefined, 'navigation must not start a new comment');
  assert.equal(send('click', document.querySelector('img')).defaultPrevented, true);
  assert.deepEqual(selected, { kind: 'element', nodeId: 'photo' });
  assert.equal(send('click', arrow, { altKey: true }).defaultPrevented, true);
  assert.deepEqual(selected, { kind: 'element', nodeId: 'next' });
});

test('gallery arrows leave a focused caption, wrap, and survive a live layout replacement', t => {
  const { document, window } = parseHTML(`<html><body><figure id="gallery" data-gallery tabindex="0">
    ${Array.from({ length: 9 }, (_, i) => `<div data-gallery-slide><div contenteditable="true">Caption ${i + 1}</div></div>`).join('')}
    <span data-gallery-counter></span>
    <button data-gallery-step="-1"><svg><path></path></svg></button>
    <button data-gallery-step="1"><svg><path></path></svg></button>
  </figure></body></html>`);
  const previous = { document: globalThis.document, window: globalThis.window, getComputedStyle: globalThis.getComputedStyle };
  let count = 3, active;
  Object.defineProperty(document, 'activeElement', { get: () => active });
  Object.assign(globalThis, { document, window, getComputedStyle: () => ({ getPropertyValue: () => String(count) }) });
  t.after(() => Object.assign(globalThis, previous));
  const refresh = startGalleries();
  const visible = () => [...document.querySelectorAll('[data-gallery-slide]')].filter(slide => !slide.hidden).map(slide => slide.textContent);
  const click = direction => {
    // Retain editor focus to reproduce browsers that do not focus clicked buttons.
    document.querySelector(`[data-gallery-step="${direction}"] path`).dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  };
  active = document.querySelector('[contenteditable]');
  click(1);
  assert.deepEqual(visible(), ['Caption 4', 'Caption 5', 'Caption 6']);
  assert.equal(document.querySelector('[data-gallery-counter]').textContent, '4–6 / 9');
  active = null;
  click(1); click(1);
  assert.deepEqual(visible(), ['Caption 1', 'Caption 2', 'Caption 3']);
  click(-1);
  assert.deepEqual(visible(), ['Caption 7', 'Caption 8', 'Caption 9']);

  const old = document.querySelector('[data-gallery]');
  old.replaceWith(old.cloneNode(true)); refresh(); click(-1);
  assert.deepEqual(visible(), ['Caption 4', 'Caption 5', 'Caption 6']);
  active = document.querySelectorAll('[contenteditable]')[5]; count = 1; refresh();
  assert.deepEqual(visible(), ['Caption 6']);
  const arrow = new window.Event('keydown', { bubbles: true, cancelable: true });
  Object.assign(arrow, { key: 'ArrowLeft' }); active.dispatchEvent(arrow);
  assert.deepEqual(visible(), ['Caption 6'], 'cursor arrows must not change pictures while typing');
  click(1);
  assert.deepEqual(visible(), ['Caption 7']);
});
