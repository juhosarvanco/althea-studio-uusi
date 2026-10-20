// Both public languages share the same assets at the site root. English pages
// use ../assets; editor pages live one directory deeper than their public page.
export function assetPath(value) {
  const path = String(value || '').replace(/^(?:\.\.\/|\/)?(?=assets\/)/, '');
  return /^assets\/[a-zA-Z0-9_./-]+$/.test(path) && !path.split('/').includes('..') ? path : null;
}

export function rewriteAssets(value, prefix) {
  return String(value).replace(/(^|[\s,'"(])(?:\.\.\/|\/)?assets\//g, `$1${prefix}assets/`);
}
