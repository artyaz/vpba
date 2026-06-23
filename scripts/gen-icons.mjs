// Dependency-free PNG icon generator: black tile with a white "blank" rule.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const staticDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static');
mkdirSync(staticDir, { recursive: true });

function png(width, height, draw) {
	const ch = 4;
	const buf = Buffer.alloc(width * height * ch);
	const set = (x, y, r, g, b, a = 255) => {
		const o = (y * width + x) * ch;
		buf[o] = r;
		buf[o + 1] = g;
		buf[o + 2] = b;
		buf[o + 3] = a;
	};
	draw(set);

	const raw = Buffer.alloc((width * ch + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * ch + 1)] = 0;
		buf.copy(raw, y * (width * ch + 1) + 1, y * width * ch, (y + 1) * width * ch);
	}
	const idat = zlib.deflateSync(raw, { level: 9 });

	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length, 0);
		const t = Buffer.from(type, 'ascii');
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0, 0);
		return Buffer.concat([len, t, data, crc]);
	};

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function icon(size) {
	const bg = [11, 11, 10];
	const fg = [245, 243, 237];
	const barH = Math.max(2, Math.round(size * 0.075));
	const r = Math.floor(barH / 2);
	const y0 = Math.round(size * 0.55);
	const x0 = Math.round(size * 0.22);
	const x1 = Math.round(size * 0.78);
	return png(size, size, (set) => {
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				let on = x >= x0 && x <= x1 && y >= y0 && y < y0 + barH;
				if (on) {
					if (x < x0 + r) {
						const dx = x0 + r - x,
							dy = y - (y0 + r);
						if (dx * dx + dy * dy > r * r) on = false;
					} else if (x > x1 - r) {
						const dx = x - (x1 - r),
							dy = y - (y0 + r);
						if (dx * dx + dy * dy > r * r) on = false;
					}
				}
				const c = on ? fg : bg;
				set(x, y, c[0], c[1], c[2]);
			}
		}
	});
}

const out = {
	'icon-192.png': 192,
	'icon-512.png': 512,
	'apple-touch-icon.png': 180,
	'favicon.png': 48
};
for (const [name, size] of Object.entries(out)) {
	writeFileSync(join(staticDir, name), icon(size));
	console.log('wrote', name, `${size}x${size}`);
}
