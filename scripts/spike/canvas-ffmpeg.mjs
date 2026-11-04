import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
const nm = process.cwd() + '/node_modules/@fontsource';
console.log(GlobalFonts.registerFromPath(nm + '/inter/files/inter-latin-800-normal.woff2', 'InterX'));
console.log(GlobalFonts.registerFromPath(nm + '/space-grotesk/files/space-grotesk-latin-700-normal.woff', 'SG'));
const W=1920,H=1080,N=90;
const c = createCanvas(W,H); const ctx = c.getContext('2d');
const ff = spawn('ffmpeg',['-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgba','-s',`${W}x${H}`,'-r','30','-i','-','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','/tmp/bridge-spike/out.mp4']);
const t0=performance.now();
for (let f=0; f<N; f++){
  const g = ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,'#1b1f3b'); g.addColorStop(1,'#3b1f4b');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#ffcc4d'; ctx.font='800 140px InterX'; ctx.fillText('Attention is all you need', 120+f*2, 540);
  ctx.fillStyle='#6ee7b7'; ctx.font='700 80px SG'; ctx.fillText('Space Grotesk '+f, 120, 760);
  ctx.beginPath(); ctx.arc(1500,300,40+f,0,Math.PI*2); ctx.fill();
  const buf = c.data(); // raw RGBA
  if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));
}
ff.stdin.end(); await new Promise(r=>ff.on('close',r));
console.log('fps', (N/((performance.now()-t0)/1000)).toFixed(1));
await import('node:fs').then(fs=>fs.writeFileSync('/tmp/bridge-spike/f.png', c.toBuffer('image/png')));
