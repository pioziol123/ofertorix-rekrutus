import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs'
import mammoth from 'mammoth'
const results=[]
for(const file of ['text.pdf','scan.pdf']) {
 const task=getDocument({data:new Uint8Array(await readFile(file)),isEvalSupported:false,useSystemFonts:false,standardFontDataUrl:new URL('./node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname})
 const doc=await task.promise
 const parts=[]
 for(let page=1;page<=doc.numPages;page++) {
  const content=await (await doc.getPage(page)).getTextContent()
  parts.push(content.items.filter(item=>'str' in item).map(item=>item.str+(item.hasEOL?'\n':' ')).join(''))
 }
 const text=parts.join('\n').trim()
 if(file==='text.pdf') assert.match(text,/Senior PHP Developer[\s\S]*Symfony and PostgreSQL/)
 else assert.equal(text,'')
 results.push({file,pages:doc.numPages,characters:text.length})
 await task.destroy()
}
const docx=await mammoth.extractRawText({buffer:await readFile('text.docx')},{externalFileAccess:false})
assert.match(docx.value,/Zażółć gęślą jaźń — Senior PHP/)
assert.match(docx.value,/Symfony i PostgreSQL/)
results.push({file:'text.docx',characters:docx.value.length,warnings:docx.messages.length})
let invalidRejected=false
try {await getDocument({data:new Uint8Array([1,2,3]),isEvalSupported:false}).promise} catch {invalidRejected=true}
assert.equal(invalidRejected,true)
results.push({invalidPdfRejected:true})
console.log(JSON.stringify({node:process.version,results},null,2))
