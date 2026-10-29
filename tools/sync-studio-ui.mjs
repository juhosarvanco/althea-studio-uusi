import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const sha=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(sha||''))throw new Error('Anna 100HRS-repon tarkka commit-tunniste (40 merkkiä).');
const directory=new URL('../vendor/studio-ui/',import.meta.url);await mkdir(directory,{recursive:true});
const hashes={},files=new Map();
for(const file of ['package.json','components.mjs','languages.mjs','ui.css']){
 let result;try{result=JSON.parse((await run('gh',['api',`repos/juhosarvanco/100hrs/contents/packages/studio-ui/${file}?ref=${sha}`],{maxBuffer:1024*1024})).stdout);}catch{throw new Error(`Yhteisen Studion tiedostoa ei saatu: ${file}. Tarkista gh-kirjautuminen.`);}
 if(result.encoding!=='base64'||typeof result.content!=='string')throw new Error('Odottamaton pakettivastaus.');
 const bytes=Buffer.from(result.content,'base64');hashes[file]=createHash('sha256').update(bytes).digest('hex');
 files.set(file,bytes);
}
for(const [file,bytes] of files)await writeFile(new URL(file,directory),bytes);
await writeFile(new URL('origin.json',directory),JSON.stringify({repository:'juhosarvanco/100hrs',commit:sha,path:'packages/studio-ui',hashes},null,2)+'\n');
console.log('Yhteinen Studio-paketti päivitetty. Tarkista muutokset ja suorita npm test sekä npm run build.');
