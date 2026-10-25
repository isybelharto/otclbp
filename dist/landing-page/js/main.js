/* LBP: static presentation and user-reviewed email preparation. No trading or server submission. */
(()=>{'use strict';
const institutionalTheme=document.createElement('link');institutionalTheme.rel='stylesheet';institutionalTheme.href=new URL('../css/institutional.css',document.currentScript.src).href;document.head.append(institutionalTheme);
const $=selector=>document.querySelector(selector);
const dictionary=JSON.parse($('#locale-data')?.textContent||'{}');
const t=text=>dictionary[text]||text;
document.querySelectorAll('[data-language-select]').forEach(select=>{
 select.hidden=false;
 select.addEventListener('change',()=>{
  const destination=new URL(select.value,location.href);
  destination.hash=location.hash;
  location.assign(destination.href);
 });
});
const header=$('.site-header'),menuButton=$('.menu-toggle'),navigation=$('#navigation');
if(header&&menuButton&&navigation){
 header.classList.add('nav-enhanced');menuButton.hidden=false;
 const closeMenu=()=>{header.classList.remove('menu-open');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label',t('Buka navigasi'));};
 menuButton.addEventListener('click',()=>{const opened=menuButton.getAttribute('aria-expanded')==='true';header.classList.toggle('menu-open',!opened);menuButton.setAttribute('aria-expanded',String(!opened));menuButton.setAttribute('aria-label',t(opened?'Buka navigasi':'Tutup navigasi'));});
 navigation.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&header.classList.contains('menu-open')){closeMenu();menuButton.focus();}});
 matchMedia('(min-width:1101px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
}
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const connection=$('.connection');
let heroVisible=true;
const pauseMotion=()=>{document.body.classList.toggle('page-paused',document.hidden);if(connection)connection.classList.toggle('is-visible',heroVisible&&!document.hidden&&!motion.matches);};
if('IntersectionObserver'in window){
 const reveals=[...document.querySelectorAll('.reveal')];
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.remove('is-waiting');observer.unobserve(entry.target);}}),{threshold:.08});
 reveals.forEach(element=>{if(!motion.matches&&element.getBoundingClientRect().top>innerHeight)element.classList.add('is-waiting');observer.observe(element);});
 document.body.classList.add('motion-ready');
 if(connection)new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;pauseMotion();}).observe(connection);
}
motion.addEventListener('change',()=>{if(motion.matches)document.querySelectorAll('.is-waiting').forEach(e=>e.classList.remove('is-waiting'));pauseMotion();});
document.addEventListener('visibilitychange',pauseMotion);pauseMotion();

const form=$('#inquiry-form');if(!form)return;
const routes={
 'usd-usdt':{from:'USD',to:'USDT',symbol:'$',targetSymbol:'₮',sourceName:'Dolar Amerika Serikat',targetName:'Tether USD',help:'Minimum USD 50.000 per transaksi. Jalur USD mengikuti konfirmasi mitra.',placeholder:'Contoh: 50000'},
 'idr-usdt':{from:'IDR',to:'USDT',symbol:'Rp',targetSymbol:'₮',sourceName:'Rupiah Indonesia',targetName:'Tether USD',help:'Ekuivalensi USD untuk IDR/USDT ditinjau tim. Tidak ada perhitungan kurs otomatis.',placeholder:'Contoh: 1000000000'},
 'usdt-idr':{from:'USDT',to:'IDR',symbol:'₮',targetSymbol:'Rp',sourceName:'Tether USD',targetName:'Rupiah Indonesia',help:'Nilai minimum ekuivalen USD dikonfirmasi tim. Tidak mengasumsikan 1 USDT = 1 USD.',placeholder:'Nominal USDT yang didiskusikan'}
};
Object.values(routes).forEach(route=>{for(const key of ['sourceName','targetName','help','placeholder'])route[key]=t(route[key]);});
const pair=$('#pair'),amount=$('#amount'),preview=$('#email-preview'),summary=$('#form-error-summary');
function clearError(input){input.removeAttribute('aria-invalid');const message=$('#'+input.id+'-error');if(message)message.textContent='';}
function setError(input,message){input.setAttribute('aria-invalid','true');const span=$('#'+input.id+'-error');if(span){span.textContent=t(message);const description=(input.getAttribute('aria-describedby')||'').split(' ').filter(Boolean);if(!description.includes(span.id))input.setAttribute('aria-describedby',[...description,span.id].join(' '));}}
function invalidatePreview(){preview.hidden=true;$('#open-email').setAttribute('href','mailto:otc@ptlbp.co.id');$('#email-body').value='';$('#copy-status').textContent='';}
function chooseRoute(key){
 if(!routes[key])return;const changed=pair.value!==key;
 pair.value=key;const r=routes[key];
 for(const [id,value]of Object.entries({'source-symbol':r.symbol,'source-currency':r.from,'source-name':r.sourceName,'target-symbol':r.targetSymbol,'target-currency':r.to,'target-name':r.targetName,'amount-unit':r.from,'amount-help':r.help}))$('#'+id).textContent=value;
 $('#target-symbol').classList.toggle('usdt-symbol',r.to==='USDT');
 document.querySelectorAll('[data-route]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.route===key)));
 if(changed){amount.value='';clearError(amount);invalidatePreview();}
 amount.placeholder=r.placeholder;
}
document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>chooseRoute(b.dataset.route)));
document.querySelectorAll('[data-select-route]').forEach(a=>a.addEventListener('click',()=>chooseRoute(a.dataset.selectRoute)));
let previousPair=pair.value;
pair.addEventListener('change',()=>{const next=pair.value;pair.value=previousPair;chooseRoute(next);previousPair=next;});
const observePair=()=>{previousPair=pair.value;};
document.querySelectorAll('[data-route],[data-select-route]').forEach(e=>e.addEventListener('click',observePair));
chooseRoute(pair.value);
form.addEventListener('input',event=>{invalidatePreview();clearError(event.target);summary.hidden=true;});
form.addEventListener('change',()=>{invalidatePreview();summary.hidden=true;});
function checkForm(){
 const problems=[];
 for(const input of form.querySelectorAll('input,select,textarea')){
  clearError(input);let message='';
  if(input.required&&input.type==='checkbox'&&!input.checked)message=input.id==='domestic'?'Konfirmasikan kewenangan dan status institusi domestik.':'Baca dan konfirmasikan pemberitahuan privasi.';
  else if(input.required&&input.type!=='checkbox'&&!input.value.trim())message='Bagian ini wajib diisi.';
  else if(input.type==='email'&&input.value&&!input.validity.valid)message='Gunakan format alamat email yang valid.';
  else if(input.id==='phone'&&input.value&&!/^\+?[0-9() .-]{8,25}$/.test(input.value.trim()))message='Periksa nomor kontak Anda (8–25 karakter).';
  if(input.id==='amount'&&input.value.trim()){
   const value=input.value.trim();
   if(!/^\d+(?:[.,]\d{1,8})?$/.test(value)||!Number.isFinite(Number(value.replace(',','.')))||Number(value.replace(',','.'))<=0)message='Masukkan angka positif tanpa pemisah ribuan, misalnya 50000.';
   else if(pair.value==='usd-usdt'&&Number(value.replace(',','.'))<50000)message='Minimum kebutuhan USD adalah 50.000 per transaksi.';
  }
  if(input.id==='pair'&&!routes[input.value])message='Pilih arah konversi yang tersedia untuk diskusi.';
  if(message){setError(input,message);problems.push({input,message});}
 }
 if(problems.length){summary.textContent=t('Periksa {count} bagian yang ditandai. Ringkasan belum dibuat.').replace('{count}',String(problems.length));summary.hidden=false;summary.focus();return false;}
 summary.hidden=true;return true;
}
const safeLine=value=>value.trim().replace(/[\r\n]+/g,' ');
form.addEventListener('submit',event=>{
 event.preventDefault();if(!checkForm()){invalidatePreview();return;}
 const r=routes[pair.value];
 const lines=[t('Permintaan OTC Institusi')+' — PT LINTAS BATAS PEMBAYARAN','',
 t('Nama legal institusi')+': '+safeLine($('#institution').value),t('Nama PIC')+': '+safeLine($('#contact-name').value),t('Jabatan')+': '+safeLine($('#contact-role').value),t('Email institusi')+': '+safeLine($('#email').value),t('Nomor kontak')+': '+safeLine($('#phone').value),t('Pendirian dan domisili: Indonesia'),'',
 t('Arah konversi')+': '+r.from+' → '+r.to,t('Nominal')+': '+safeLine(amount.value)+' '+r.from,t('Tujuan kebutuhan')+': '+t(safeLine($('#purpose').value)),t('Catatan kebutuhan')+': '+($('#message').value.trim()||'-'),'',t('Saya mewakili institusi yang didirikan dan berdomisili di Indonesia, serta berwenang mengajukan kebutuhan ini.'),t('Pengajuan awal belum merupakan quote, persetujuan klien, atau instruksi transfer.'),t('Seluruh komponen yang berlaku dijelaskan sebelum proses transaksi. Biaya, masa berlaku quote, batas pendanaan, SLA dan skema penyelesaian mengikuti kesepakatan terpisah.')];
 if(r.from!=='USD')lines.push(t('Nilai minimum ekuivalen USD dikonfirmasi tim. Tidak mengasumsikan 1 USDT = 1 USD.'));
 const body=lines.join('\n');$('#email-body').value=body;
 $('#open-email').href='mailto:otc@ptlbp.co.id?subject='+encodeURIComponent(t('Permintaan OTC Institusi')+' — '+r.from+' → '+r.to)+'&body='+encodeURIComponent(body);
 preview.hidden=false;$('#preview-title').focus({preventScroll:true});preview.scrollIntoView({behavior:motion.matches?'instant':'smooth',block:'nearest'});
});
$('#copy-request').addEventListener('click',async()=>{const area=$('#email-body');try{if(!navigator.clipboard||!window.isSecureContext)throw Error('manual');await navigator.clipboard.writeText(area.value);$('#copy-status').textContent=t('Ringkasan disalin. Tempel dan kirim melalui email Anda.');}catch{area.focus();area.select();$('#copy-status').textContent=t('Teks dipilih. Salin secara manual, lalu kirim melalui email Anda.');}});
// Reveal only once submission is intercepted; without JavaScript the email fallback remains.
form.hidden=false;
})();
