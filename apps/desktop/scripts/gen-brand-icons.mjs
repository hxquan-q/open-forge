// Copyright The Open Forge contributors.
// 从 scripts/brand-icons/Allstar2.png 生成外部分发档打包图标：
//   apps/desktop/build/brand/distribution/{icon.ico,icon.png,icon.icns,icon-dock.png}
// 零依赖：node:zlib 解码/编码 PNG，ICO 小尺寸用 BMP 表项、128+ 用 PNG 表项，
// ICNS 用 PNG 内嵌表项（ic07/ic08/ic09/ic10）。
// 用法：node scripts/gen-brand-icons.mjs [输出目录]，默认写回 build/brand/distribution；
// 输出目录参数供回归测试比对生成链能否复现已入库图标。
import { inflateSync, deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SOURCE = join(import.meta.dirname, "brand-icons", "Allstar2.png");
const OUT_DIR = process.argv[2] ? resolve(process.argv[2]) : join(import.meta.dirname, "..", "build", "brand", "distribution");

// ---------- PNG 解码 ----------
function decodePng(path) {
	const buf = readFileSync(path);
	if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
	let offset = 8;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	const idat = [];
	while (offset < buf.length) {
		const length = buf.readUInt32BE(offset);
		const type = buf.toString("ascii", offset + 4, offset + 8);
		const dataStart = offset + 8;
		if (type === "IHDR") {
			width = buf.readUInt32BE(dataStart);
			height = buf.readUInt32BE(dataStart + 4);
			bitDepth = buf[dataStart + 8];
			colorType = buf[dataStart + 9];
		} else if (type === "IDAT") {
			idat.push(buf.subarray(dataStart, dataStart + length));
		} else if (type === "IEND") {
			break;
		}
		offset = dataStart + length + 4;
	}
	if (bitDepth !== 8 || colorType !== 6) {
		throw new Error(`unsupported PNG: bitDepth=${bitDepth} colorType=${colorType}`);
	}
	const raw = inflateSync(Buffer.concat(idat));
	const stride = width * 4;
	const pixels = Buffer.alloc(width * height * 4);
	const unfilterRow = (filter, row, prev) => {
		for (let x = 0; x < stride; x += 1) {
			const left = x >= 4 ? row[x - 4] : 0;
			const up = prev ? prev[x] : 0;
			const upLeft = x >= 4 && prev ? prev[x - 4] : 0;
			let value = row[x];
			if (filter === 1) value += left;
			else if (filter === 2) value += up;
			else if (filter === 3) value += (left + up) >> 1;
			else if (filter === 4) {
				const p = left + up - upLeft;
				const pa = Math.abs(p - left);
				const pb = Math.abs(p - up);
				const pc = Math.abs(p - upLeft);
				value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
			}
			row[x] = value & 0xff;
		}
	};
	for (let y = 0; y < height; y += 1) {
		const rowStart = y * (stride + 1);
		const filter = raw[rowStart];
		const row = raw.subarray(rowStart + 1, rowStart + 1 + stride);
		const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
		unfilterRow(filter, row, prev);
		row.copy(pixels, y * stride);
	}
	return { width, height, pixels };
}

// ---------- 区域平均缩放（预乘 alpha）----------
function resizeArea(source, targetSize) {
	const { width: sw, height: sh, pixels } = source;
	const out = Buffer.alloc(targetSize * targetSize * 4);
	const acc = new Float64Array(targetSize * 4);
	const scaleY = sh / targetSize;
	const scaleX = sw / targetSize;
	// 列分块与 ty 无关，预计算每块的实际源列数（alpha 归一化必须用实际
	// 采样数而非 scaleX，否则进位列的 alpha 会溢出 255 回绕成小值，表现为竖纹）。
	const colOffsets = new Int32Array(targetSize + 1);
	for (let tx = 0; tx < targetSize; tx += 1) {
		const tx1 = Math.floor((tx + 1) * scaleX);
		colOffsets[tx + 1] = Math.max(colOffsets[tx] + 1, Math.min(sw, tx1));
	}
	for (let ty = 0; ty < targetSize; ty += 1) {
		acc.fill(0);
		const sy0 = Math.floor(ty * scaleY);
		const sy1 = Math.max(sy0 + 1, Math.floor((ty + 1) * scaleY));
		for (let sy = sy0; sy < sy1; sy += 1) {
			const rowStart = sy * sw * 4;
			for (let tx = 0; tx < targetSize; tx += 1) {
				let a = 0;
				let r = 0;
				let g = 0;
				let b = 0;
				for (let sx = colOffsets[tx]; sx < colOffsets[tx + 1]; sx += 1) {
					const px = rowStart + sx * 4;
					const alpha = pixels[px + 3];
					a += alpha;
					r += pixels[px] * alpha;
					g += pixels[px + 1] * alpha;
					b += pixels[px + 2] * alpha;
				}
				acc[tx * 4] += r;
				acc[tx * 4 + 1] += g;
				acc[tx * 4 + 2] += b;
				acc[tx * 4 + 3] += a;
			}
		}
		const rowCount = sy1 - sy0;
		const outRow = ty * targetSize * 4;
		for (let tx = 0; tx < targetSize; tx += 1) {
			const samples = rowCount * (colOffsets[tx + 1] - colOffsets[tx]);
			const a = acc[tx * 4 + 3] / samples;
			const o = outRow + tx * 4;
			if (a <= 0.5) {
				out[o] = 0;
				out[o + 1] = 0;
				out[o + 2] = 0;
				out[o + 3] = 0;
				continue;
			}
			out[o] = Math.round(acc[tx * 4] / acc[tx * 4 + 3]);
			out[o + 1] = Math.round(acc[tx * 4 + 1] / acc[tx * 4 + 3]);
			out[o + 2] = Math.round(acc[tx * 4 + 2] / acc[tx * 4 + 3]);
			out[o + 3] = Math.min(255, Math.round(a));
		}
	}
	return { width: targetSize, height: targetSize, pixels: out };
}

// ---------- PNG 编码 ----------
function crc32(buf) {
	let c = ~0;
	for (let i = 0; i < buf.length; i += 1) {
		c ^= buf[i];
		for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
}

function encodePng(image) {
	const { width, height, pixels } = image;
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y += 1) {
		raw[y * (stride + 1)] = 0;
		pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	const chunks = [];
	const pushChunk = (type, data) => {
		const header = Buffer.alloc(8);
		header.writeUInt32BE(data.length, 0);
		header.write(type, 4, "ascii");
		const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body), 0);
		chunks.push(header, data, crc);
	};
	pushChunk("IHDR", ihdr);
	pushChunk("IDAT", deflateSync(raw, { level: 9 }));
	pushChunk("IEND", Buffer.alloc(0));
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}

// ---------- ICO ----------
function bmpEntry(size, image) {
	const { pixels } = image;
	const andStride = Math.ceil(size / 8 / 4) * 4;
	const data = Buffer.alloc(40 + size * size * 4 + andStride * size);
	data.writeUInt32LE(40, 0);
	data.writeInt32LE(size, 4);
	data.writeInt32LE(size * 2, 8);
	data.writeUInt16LE(1, 12);
	data.writeUInt16LE(32, 14);
	let offset = 40;
	for (let y = size - 1; y >= 0; y -= 1) {
		for (let x = 0; x < size; x += 1) {
			const s = (y * size + x) * 4;
			data[offset] = pixels[s + 2];
			data[offset + 1] = pixels[s + 1];
			data[offset + 2] = pixels[s];
			data[offset + 3] = pixels[s + 3];
			offset += 4;
		}
	}
	return data;
}

function encodeIco(sources) {
	const pngSources = new Map(sources.map((entry) => [entry.size, entry.image]));
	const entries = [16, 24, 32, 48, 64, 128, 256].map((size) => {
		const image = pngSources.get(size);
		if (size >= 128) return { size, data: encodePng(image), isPng: true };
		return { size, data: bmpEntry(size, image), isPng: false };
	});
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(entries.length, 4);
	const directorySize = 16 * entries.length;
	const directory = Buffer.alloc(directorySize);
	let dataOffset = 6 + directorySize;
	entries.forEach((entry, index) => {
		const base = index * 16;
		directory[base] = entry.size % 256;
		directory[base + 1] = entry.size % 256;
		directory[base + 2] = 0;
		directory[base + 3] = 0;
		directory.writeUInt16LE(1, base + 4);
		directory.writeUInt16LE(entry.isPng ? 32 : 32, base + 6);
		directory.writeUInt32LE(entry.data.length, base + 8);
		directory.writeUInt32LE(dataOffset, base + 12);
		dataOffset += entry.data.length;
	});
	return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

// ---------- ICNS ----------
const ICNS_TYPES = { 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };

function encodeIcns(pngBySize) {
	const entries = Object.entries(ICNS_TYPES).map(([size, type]) => {
		const png = pngBySize[Number(size)];
		const header = Buffer.alloc(8);
		header.write(type, 0, "ascii");
		header.writeUInt32BE(png.length + 8, 4);
		return Buffer.concat([header, png]);
	});
	const total =
		8 + entries.reduce((sum, entry) => sum + entry.length, 0);
	const header = Buffer.alloc(8);
	header.write("icns", 0, "ascii");
	header.writeUInt32BE(total, 4);
	return Buffer.concat([header, ...entries]);
}

// ---------- 主流程 ----------
const source = decodePng(SOURCE);
console.log(`source: ${source.width}x${source.height}`);

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const resized = new Map(sizes.map((size) => [size, resizeArea(source, size)]));
const png = new Map([...resized].map(([size, image]) => [size, encodePng(image)]));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "icon.ico"), encodeIco([...resized.entries()].map(([size, image]) => ({ size, image }))));
writeFileSync(join(OUT_DIR, "icon.png"), png.get(1024));
writeFileSync(join(OUT_DIR, "icon.icns"), encodeIcns(Object.fromEntries(png)));
writeFileSync(join(OUT_DIR, "icon-dock.png"), png.get(512));

for (const name of ["icon.ico", "icon.png", "icon.icns", "icon-dock.png"]) {
	const file = join(OUT_DIR, name);
	console.log(`${name}: ${readFileSync(file).length} bytes`);
}
