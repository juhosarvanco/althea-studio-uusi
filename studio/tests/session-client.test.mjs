import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionCache, needsLogin } from '../session-cache.mjs';
import { participants } from '../presence.mjs';

const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
test('another tab or reopened browser can renew login without using the expired access token', () => {
  const persistent = storage(), firstTab = storage();
  sessionCache(persistent, firstTab).save({ token: 'access-token', remember: 'private-remember-key' });
  const nextTab = sessionCache(persistent, storage());
  assert.equal(nextTab.credential(), 'althea-remember.private-remember-key');
  nextTab.save({ token: 'fresh-access-token' });
  assert.equal(nextTab.credential(), 'althea-remember.private-remember-key');
  assert.equal(needsLogin(new TypeError('Network down')), false);
  assert.equal(needsLogin({ status: 502 }), false);
  assert.equal(needsLogin({ status: 401 }), true);
  nextTab.clear(); assert.equal(sessionCache(persistent, storage()).credential(), null);
});
test('people are grouped by account across tabs while each field cursor stays available', () => {
  const state = (login, name, activeField) => ({ user: { login, name, color: '#444' }, activeField });
  const groups = participants([[1, state('juho', 'Juho', 'one')], [2, state('juho', 'Juho', 'two')],
    [3, state('julia', 'Julia', 'three')], [4, state('julia', 'Julia', 'four')]], 2);
  assert.equal(groups.length, 2); assert.equal(groups[0].own, true); assert.equal(groups[0].activeField, 'two');
  assert.deepEqual(groups[0].clients.map(client => client.activeField), ['one', 'two']);
  assert.equal(groups[1].user.login, 'julia'); assert.equal(groups[1].clients.length, 2);
  assert.equal(participants([[1, null]], 1).length, 0);
});
