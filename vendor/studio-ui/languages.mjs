// Shared locale identifiers; UI language stays Finnish while site content changes.
export const DEFAULT_LANGUAGE = 'fi';
export const LANGUAGE_OPTIONS = Object.freeze([
  {code:'fi',name:'Suomi'},{code:'en',name:'English'},{code:'sv',name:'Svenska'},
  {code:'de',name:'Deutsch'},{code:'fr',name:'Français'},{code:'es',name:'Español'},
  {code:'it',name:'Italiano'},{code:'et',name:'Eesti'},{code:'nb',name:'Norsk'},{code:'da',name:'Dansk'}
]);
export const languageName = code => LANGUAGE_OPTIONS.find(item=>item.code===code)?.name || code;
export const validLanguage = code => LANGUAGE_OPTIONS.some(item=>item.code===code);
