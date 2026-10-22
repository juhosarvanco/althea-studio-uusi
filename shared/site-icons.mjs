// Keep the icon independent of Studio's saved page layouts, so publishing a
// text draft cannot remove it. Both languages use assets from the site root.
export function applySiteIcons(document, base) {
  document.querySelectorAll('link[data-althea-icon]').forEach(link => link.remove());
  for (const attributes of [
    { rel: 'icon', href: 'favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
    { rel: 'icon', href: 'favicon-32.png', sizes: '32x32', type: 'image/png' },
    { rel: 'icon', href: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    { rel: 'apple-touch-icon', href: 'apple-touch-icon.png', sizes: '180x180' },
  ]) {
    const link = document.createElement('link'); link.setAttribute('data-althea-icon', '');
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, name === 'href' ? base + value : value);
    document.head.append(link);
  }
}
