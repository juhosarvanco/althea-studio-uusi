export function participants(states, ownId) {
  const groups = new Map();
  for (const [id, state] of states) {
    if (!state?.user?.name) continue;
    const key = state.user.login || state.user.name;
    let group = groups.get(key);
    if (!group) { group = { ...state, own: false, clients: [] }; groups.set(key, group); }
    group.clients.push({ id, ...state });
    if (id === ownId) { group.own = true; group.activeField = state.activeField; }
    else if (!group.activeField && state.activeField) group.activeField = state.activeField;
  }
  return [...groups.values()].sort((a, b) => Number(b.own) - Number(a.own));
}
