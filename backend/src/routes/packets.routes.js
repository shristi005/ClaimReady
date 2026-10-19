const router = require('express').Router();
const { z } = require('zod');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { deflateRawSync } = require('zlib');
const { getDb } = require('../db');
const env = require('../config/env');
const repo = require('../services/claimsRepository');
const { sniffMime, safeName } = require('../utils/fileValidation');
const { authenticate, requireOrg, requireRole } = require('../middleware/auth');
const guard = [authenticate, requireOrg];
const editor = requireRole('admin','reviewer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 }, fileFilter: (req,file,cb) => ['application/pdf','image/png','image/jpeg'].includes(file.mimetype) ? cb(null,true) : cb(new Error('Only PDF, PNG and JPG files are allowed')) }).single('file');
const requiredDocs = [
  ['claim_form','Claim form'], ['hospital_bill','Hospital bill'], ['discharge_summary','Discharge summary'],
];
const itemSchema = z.object({ label:z.string().trim().min(2).max(120), kind:z.enum(['document','signature','other']).default('document'), required:z.boolean().default(true) });
const statusSchema = z.object({ status:z.enum(['missing','present','needs_review']) });

function getPacket(orgId, claimId) {
  const db=getDb();
  const claim=db.prepare('SELECT id,claim_reference,patient_reference,insurer_name,created_at FROM claims WHERE id=? AND org_id=?').get(claimId,orgId);
  if(!claim)return null;
  const insert=db.prepare('INSERT OR IGNORE INTO packet_checklist_items (id,org_id,claim_id,label,kind,required,status) VALUES (?,?,?,?,?,?,?)');
  for(const [type,label] of requiredDocs) {
    const doc=db.prepare('SELECT id FROM documents WHERE claim_id=? AND org_id=? AND doc_type=? ORDER BY rowid LIMIT 1').get(claimId,orgId,type);
    insert.run(crypto.randomUUID(),orgId,claimId,label,'document',1,doc?'present':'missing');
    if(doc) db.prepare("UPDATE packet_checklist_items SET document_id=?,status='present' WHERE org_id=? AND claim_id=? AND label=?").run(doc.id,orgId,claimId,label);
  }
  const checklist=db.prepare(`SELECT i.*,d.original_name,d.doc_type FROM packet_checklist_items i LEFT JOIN documents d ON d.id=i.document_id AND d.org_id=i.org_id WHERE i.org_id=? AND i.claim_id=? ORDER BY CASE i.label WHEN 'Claim form' THEN 1 WHEN 'Hospital bill' THEN 2 WHEN 'Discharge summary' THEN 3 ELSE 4 END,i.created_at`).all(orgId,claimId).map(x=>({...x,required:!!x.required}));
  const documents=db.prepare('SELECT id,doc_type,original_name,mime_type FROM documents WHERE claim_id=? AND org_id=? ORDER BY rowid').all(claimId,orgId);
  const missing=checklist.filter(x=>x.required&&x.status!=='present');
  return {claim,checklist,documents,ready:missing.length===0,missing_count:missing.length};
}

function crc32(buf) {
  let crc=0xffffffff;
  for(const b of buf){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
  return (crc^0xffffffff)>>>0;
}
function zip(entries) {
  const local=[], central=[]; let offset=0;
  const now=new Date(), dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1), dosDate=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const entry of entries){
    const name=Buffer.from(entry.name.replace(/\\/g,'/'),'utf8'), raw=Buffer.isBuffer(entry.data)?entry.data:Buffer.from(entry.data,'utf8'), packed=deflateRawSync(raw), crc=crc32(raw);
    const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x800,6);lh.writeUInt16LE(8,8);lh.writeUInt16LE(dosTime,10);lh.writeUInt16LE(dosDate,12);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(packed.length,18);lh.writeUInt32LE(raw.length,22);lh.writeUInt16LE(name.length,26);lh.writeUInt16LE(0,28);
    const block=Buffer.concat([lh,name,packed]);local.push(block);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x800,8);ch.writeUInt16LE(8,10);ch.writeUInt16LE(dosTime,12);ch.writeUInt16LE(dosDate,14);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(packed.length,20);ch.writeUInt32LE(raw.length,24);ch.writeUInt16LE(name.length,28);ch.writeUInt16LE(0,30);ch.writeUInt16LE(0,32);ch.writeUInt16LE(0,34);ch.writeUInt16LE(0,36);ch.writeUInt32LE(0,38);ch.writeUInt32LE(offset,42);central.push(Buffer.concat([ch,name]));offset+=block.length;
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
  return Buffer.concat([...local,directory,end]);
}

router.get('/packets/:claimId',...guard,(req,res)=>{const packet=getPacket(req.orgId,req.params.claimId);if(!packet)return res.status(404).json({error:'Claim not found.'});res.json(packet)});
router.post('/packets/:claimId/items',...guard,editor,(req,res,next)=>{try{const input=itemSchema.parse(req.body),db=getDb();if(!db.prepare('SELECT 1 FROM claims WHERE id=? AND org_id=?').get(req.params.claimId,req.orgId))return res.status(404).json({error:'Claim not found.'});db.prepare('INSERT INTO packet_checklist_items (id,org_id,claim_id,label,kind,required,status) VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(),req.orgId,req.params.claimId,input.label,input.kind,input.required,input.kind==='signature'?'needs_review':'missing');res.status(201).json(getPacket(req.orgId,req.params.claimId));}catch(e){next(e)}});
router.patch('/packets/:claimId/items/:itemId',...guard,editor,(req,res,next)=>{try{const input=statusSchema.parse(req.body),db=getDb();const item=db.prepare('SELECT id,document_id,kind FROM packet_checklist_items WHERE id=? AND claim_id=? AND org_id=?').get(req.params.itemId,req.params.claimId,req.orgId);if(!item)return res.status(404).json({error:'Checklist item not found.'});let documentId=item.document_id;if(input.status==='present'&&!documentId&&item.kind==='signature'){documentId=db.prepare("SELECT id FROM documents WHERE claim_id=? AND org_id=? AND doc_type='claim_form' ORDER BY rowid LIMIT 1").get(req.params.claimId,req.orgId)?.id||null;}if(input.status==='present'&&!documentId)return res.status(400).json({error:'Upload the document before marking it present in the packet.'});db.prepare('UPDATE packet_checklist_items SET status=?,document_id=? WHERE id=? AND org_id=?').run(input.status,documentId,item.id,req.orgId);res.json(getPacket(req.orgId,req.params.claimId));}catch(e){next(e)}});
router.delete('/packets/:claimId/items/:itemId',...guard,editor,(req,res)=>{const db=getDb();const r=db.prepare("DELETE FROM packet_checklist_items WHERE id=? AND claim_id=? AND org_id=? AND label NOT IN ('Claim form','Hospital bill','Discharge summary')").run(req.params.itemId,req.params.claimId,req.orgId);if(!r.changes)return res.status(404).json({error:'Custom checklist item not found.'});res.json(getPacket(req.orgId,req.params.claimId))});
router.post('/packets/:claimId/items/:itemId/file',...guard,editor,(req,res,next)=>upload(req,res,async(err)=>{try{if(err)return next(err);if(!req.file)return res.status(400).json({error:'Choose a PDF, PNG or JPG file.'});const db=getDb(),item=db.prepare('SELECT id,label FROM packet_checklist_items WHERE id=? AND claim_id=? AND org_id=?').get(req.params.itemId,req.params.claimId,req.orgId);if(!item)return res.status(404).json({error:'Checklist item not found.'});const mime=sniffMime(req.file.buffer);if(!mime)return res.status(400).json({error:'The file content is not a valid PDF, PNG or JPG.'});const docId=crypto.randomUUID(),originalname=String(req.file.originalname||'document').slice(0,200),ext=path.extname(safeName(originalname)).slice(0,10);const docType=requiredDocs.find(([,label])=>label.toLowerCase()===item.label.toLowerCase())?.[0]||'packet_supporting';await repo.storeDocument({orgId:req.orgId,claimId:req.params.claimId,docType,file:{...req.file,originalname},storageName:`${docId}${ext}`});const saved=db.prepare('SELECT id FROM documents WHERE org_id=? AND claim_id=? AND doc_type=? AND storage_path LIKE ? ORDER BY rowid DESC LIMIT 1').get(req.orgId,req.params.claimId,docType,`%${docId}${ext}`);db.prepare("UPDATE packet_checklist_items SET document_id=?,status='present' WHERE id=? AND org_id=?").run(saved.id,item.id,req.orgId);res.status(201).json(getPacket(req.orgId,req.params.claimId));}catch(e){next(e)}}));
router.get('/packets/:claimId/download',...guard,async(req,res,next)=>{try{const packet=getPacket(req.orgId,req.params.claimId);if(!packet)return res.status(404).json({error:'Claim not found.'});const db=getDb(),entries=[],included=new Set();const names={claim_form:'01_Claim_Form',hospital_bill:'02_Hospital_Bill',discharge_summary:'03_Discharge_Summary',packet_supporting:'04_Supporting_Documents'};for(const item of packet.checklist){if(!item.document_id||item.status!=='present'||included.has(item.document_id))continue;const f=db.prepare('SELECT id,doc_type,original_name FROM documents WHERE id=? AND org_id=? AND claim_id=?').get(item.document_id,req.orgId,req.params.claimId);if(!f)continue;const file=await repo.getDocumentFile(req.orgId,f.id);if(file){entries.push({name:`${names[f.doc_type]||'04_Supporting_Documents'}/${safeName(f.original_name)}`,data:fs.readFileSync(file.abs)});included.add(item.document_id)}}
  const lines=[`CLAIM DOCUMENT PACKET`,`Claim reference: ${packet.claim.claim_reference}`,`Patient ID: ${packet.claim.patient_reference||'Not recorded'}`,`Insurer: ${packet.claim.insurer_name||'Not recorded'}`,`Checklist complete: ${packet.ready?'Yes':'No'}`,``,`FILES INCLUDED IN THIS DOWNLOAD`];for(const entry of entries)if(entry.name!=='00_PACKET_CHECKLIST.txt')lines.push(`- ${entry.name}`);if(entries.length===1)lines.push('- No claim files are attached yet.');const missing=packet.checklist.filter(item=>item.required&&item.status!=='present');if(missing.length){lines.push('',`STILL NEEDED`);for(const item of missing)lines.push(`- ${item.label}${item.kind==='signature'&&item.status==='needs_review'?' — staff must check the signature':item.kind==='signature'&&item.status==='missing'?' — marked missing':' — required file not uploaded'}`)}const optional=packet.checklist.filter(item=>!item.required&&item.status!=='present');if(optional.length){lines.push('',`OPTIONAL ITEMS NOT INCLUDED`);for(const item of optional)lines.push(`- ${item.label}`)}lines.push('',`This ZIP only gathers the files listed above. It does not submit the claim. Staff must review the documents and confirm all required signatures before sending.`);entries.push({name:'00_READ_ME_FIRST.txt',data:lines.join('\n')});const body=zip(entries),fileName=`ClaimReady_${safeName(packet.claim.claim_reference||'claim')}.zip`;res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition',`attachment; filename="${fileName}"`);res.setHeader('Content-Length',body.length);res.send(body);
}catch(e){next(e)}});
module.exports=router;
