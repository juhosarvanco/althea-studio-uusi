import * as Y from 'yjs';
import { absolutePositionToRelativePosition } from '@tiptap/y-tiptap';

// Cursor positions use left association. Comment starts attach to the first
// selected character, excluding text inserted immediately before the quote.
export function relativeCommentPosition(doc, fragment, mapping, position, association) {
  const cursor = absolutePositionToRelativePosition(position, fragment, mapping);
  const absolute = Y.createAbsolutePositionFromRelativePosition(cursor, doc);
  return Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(absolute.type, absolute.index, association));
}
