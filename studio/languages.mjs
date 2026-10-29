import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,cpSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {parseHTML} from 'linkedom';
import {prepareTemplate} from './template.mjs';
import {rewriteAssets} from '../shared/site-assets.mjs';
import {LANGUAGE_OPTIONS,validLanguage,languageName} from '../vendor/studio-ui/languages.mjs';
export {validLanguage,languageName};
const fail=(message,status=400)=>{const error=new Error(message);error.status=status;throw error;};
const atomic=(path,value)=>{writeFileSync(path+'.tmp',JSON.stringify(value),{mode:0o600});renameSync(path+'.tmp',path);};
export class LanguageRegistry{
 constructor(directory){this.directory=directory;this.file=join(directory,'languages.json');this.extra=existsSync(this.file)?JSON.parse(readFileSync(this.file,'utf8')):[];
  if(!Array.isArray(this.extra)||this.extra.length>6||this.extra.some(item=>!validLanguage(item.code)||['fi','en'].includes(item.code))||new Set(this.extra.map(item=>item.code)).size!==this.extra.length)throw new Error('Kieliversioiden tallennusta ei voitu vahvistaa. Tallenteet on säilytetty.');
 }
 list(){return [{code:'fi',name:'Suomi',draft:false},{code:'en',name:'English',draft:false},...this.extra.map(item=>({code:item.code,name:languageName(item.code),draft:item.draft!==false}))];}
 bootstrap(code){if(!this.extra.some(item=>item.code===code))return null;return prepareTemplate(readFileSync(join(this.directory,code,'bootstrap.html'),'utf8'));}
 prepare(code,source){
  if(!validLanguage(code)||['fi','en'].includes(code))fail('Valitse tuettu uusi kieli.');
  if(this.list().some(item=>item.code===code))fail('Kieliversio on jo olemassa.',422);
  if(this.list().length>=8)fail('Sivustolla voi olla enintään kahdeksan kieliversiota.',422);
  const directory=join(this.directory,code);if(existsSync(directory))fail('Tälle kielelle on jo tallenteita. Niitä ei korvattu.',409);
  const {document}=parseHTML(source.store.export().html);document.documentElement.setAttribute('lang',code);
  for(const el of document.querySelectorAll('[src],[href],[srcset]'))for(const name of ['src','href','srcset']){const value=el.getAttribute(name);if(value)el.setAttribute(name,rewriteAssets(value,'../'));}
  for(const style of document.querySelectorAll('style'))style.textContent=rewriteAssets(style.textContent,'../');
  for(const script of document.querySelectorAll('script[src]'))if(/^(?:\.\.\/)?app\.js(?:\?|$)/.test(script.getAttribute('src')))script.setAttribute('src','../'+script.getAttribute('src').replace(/^\.\.\//,''));
  document.querySelector('link[rel=canonical]')?.setAttribute('href',`https://www.althea.fi/${code}/`);document.querySelector('meta[property="og:url"]')?.setAttribute('content',`https://www.althea.fi/${code}/`);
  document.querySelectorAll('link[rel=alternate]').forEach(el=>el.remove());
  const result=prepareTemplate('<!doctype html>\n'+document.documentElement.outerHTML);
  mkdirSync(directory,{recursive:true,mode:0o700});try{writeFileSync(join(directory,'bootstrap.html'),result.template,{mode:0o600});cpSync(source.media.directory,join(directory,'media'),{recursive:true});}catch(error){rmSync(directory,{recursive:true,force:true});throw error;}
  return result;
 }
 commit(code,source,actor){this.extra.push({code,source,createdAt:new Date().toISOString(),createdBy:actor.name,draft:true});try{atomic(this.file,this.extra);}catch(error){this.extra.pop();throw error;}}
 rollback(code){if(!this.extra.some(item=>item.code===code)&&validLanguage(code)&&!['fi','en'].includes(code))rmSync(join(this.directory,code),{recursive:true,force:true});}
 canCreate(code){return this.extra.some(item=>item.code===code&&item.draft!==false);}
 published(code){const item=this.extra.find(item=>item.code===code);if(item){item.draft=false;atomic(this.file,this.extra);}}
}
