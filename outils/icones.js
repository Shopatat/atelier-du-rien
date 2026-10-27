// Dessine les icônes de l'appli (le cadre de l'appareil : quatre coins, et rien à cadrer)
// et les range dans icons/. Lancer depuis la racine du dossier : node outils/icones.js
// Aucun module à installer : le PNG est encodé à la main avec zlib.
const fs = require('fs'), zlib = require('zlib'), path = require('path');

const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const PAPIER = hex('#E9EBE7'), ENCRE = hex('#141917');

// Repère : 0..1, y vers le bas. Le cadre tient dans un carré de côté M - m,
// et chaque coin n'en garde que deux bras de longueur BRAS. Le milieu reste vide.
const DEMI = 0.030;          // demi-épaisseur du trait
const BRAS = 0.165;          // longueur d'un bras, depuis le coin
const m = 0.225, M = 1 - m;  // les deux bords du cadre

// Les huit bras : deux par coin, un horizontal, un vertical. Chacun est un rectangle
// débordant de DEMI à chaque bout — c'est ce qui remplit le coin et donne des bouts nets
// (en SVG : stroke-linecap="square" + stroke-linejoin="miter").
const BRAS_LISTE = [];
for(const [cx, sx] of [[m, 1], [M, -1]])
  for(const [cy, sy] of [[m, 1], [M, -1]]){
    BRAS_LISTE.push([cx, cy, cx + sx * BRAS, cy]);
    BRAS_LISTE.push([cx, cy, cx, cy + sy * BRAS]);
  }

function couleur(x, y){
  for(const [ax, ay, bx, by] of BRAS_LISTE){
    const x0 = Math.min(ax, bx) - DEMI, x1 = Math.max(ax, bx) + DEMI;
    const y0 = Math.min(ay, by) - DEMI, y1 = Math.max(ay, by) + DEMI;
    if(x >= x0 && x <= x1 && y >= y0 && y <= y1) return ENCRE;
  }
  return PAPIER;
}

// Rendu avec lissage : 4×4 sous-pixels. `k` rétrécit le dessin (icône maskable).
function render(size, maskable){
  const k = maskable ? 0.72 : 1, ss = 4, px = Buffer.alloc(size * size * 3);
  for(let j = 0; j < size; j++) for(let i = 0; i < size; i++){
    let r = 0, g = 0, b = 0;
    for(let sj = 0; sj < ss; sj++) for(let si = 0; si < ss; si++){
      const x = ((i + (si + .5) / ss) / size - .5) / k + .5;
      const y = ((j + (sj + .5) / ss) / size - .5) / k + .5;
      const c = couleur(x, y); r += c[0]; g += c[1]; b += c[2];
    }
    const o = (j * size + i) * 3, n = ss * ss;
    px[o] = Math.round(r / n); px[o+1] = Math.round(g / n); px[o+2] = Math.round(b / n);
  }
  return png(size, px);
}

// --- encodeur PNG (RVB 8 bits) ---
const CRC = new Int32Array(256).map((_, n) => { let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for(const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px){
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for(let y = 0; y < size; y++){ raw[y * (size * 3 + 1)] = 0; px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level:9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive:true });
for(const [name, size, maskable] of [['icon-192.png',192], ['icon-512.png',512], ['icon-maskable-512.png',512,true], ['apple-touch-icon.png',180], ['favicon-32.png',32]]){
  fs.writeFileSync(path.join(out, name), render(size, maskable));
  console.log('icons/' + name);
}
