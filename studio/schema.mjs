import { getSchema } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';

export const inlineExtensions = [Document.extend({ content: 'paragraph' }), Paragraph, Text, HardBreak, Bold, Italic,
  Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { rel: 'noopener', target: null } })];
export const schema = getSchema(inlineExtensions);
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function safeHref(value) {
  const href = String(value || '').trim();
  return /^(https?:\/\/|mailto:|#|\/(?!\/)|assets\/)/i.test(href) ? href : '#';
}
export function inlineHTML(json) {
  if (json.content?.length !== 1 || json.content[0].type !== 'paragraph') throw new Error('One paragraph per field is required');
  return (json.content[0].content || []).map(node => {
    if (node.type === 'hardBreak') return '<br>';
    if (node.type !== 'text') throw new Error('Unsupported content node');
    let html = escapeHTML(node.text || '');
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') html = `<strong>${html}</strong>`;
      else if (mark.type === 'italic') html = `<em>${html}</em>`;
      else if (mark.type === 'link') html = `<a href="${escapeHTML(safeHref(mark.attrs?.href))}" rel="noopener">${html}</a>`;
      else throw new Error('Unsupported content mark');
    }
    return html;
  }).join('');
}
