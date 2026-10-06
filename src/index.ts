/**
* Welcome to Cloudflare Workers! This is your first worker.
*
* - Run `npm run dev` in your terminal to start a development server
* - Open a browser tab at http://localhost:8787/ to see your worker in action
* - Run `npm run deploy` to publish your worker
*
* Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
* `Env` object can be regenerated with `npm run cf-typegen`.
*
* Learn more at https://developers.cloudflare.com/workers/
*/

const UTF8 = new TextEncoder();
const ZIP_LOCAL_FILE_HEADER_MAGIC_NUMBER        = 0x50_4B_03_04;
const ZIP_CENTRAL_DIRECTORY_MAGIC_NUMEBR        = 0x50_4B_01_02;
const ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC_NUMBER = 0x50_4B_05_06;
const ZIP_LOCAL_FILE_HEADER_LENGTH 				= 30; // length of the local file header without filename
const ZIP_CENTRAL_DIRECTORY_LENGTH        = 46; // length of the central directory file record without filename
const ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH = 22; // length of the central directory file record without filename
const ZIP_VERSION = 45; // version 4.5 for zip64
const ZIP_VERSION_UNIX = ZIP_VERSION << 8 | 3; // unix is "3"

const DATA_KEYS2 = [
	{filename: "33RR20220430su.txt", key: "d0/43/d0432cfd4443ca8990e28c56f9fb6be47d014cda04f54e7808ba12926e2d7406", crc32: "67b7e759", fileSize: 20686},
	{filename: "33RO20161119_hy1.csv", key: "38/e0/38e0394ad012dd1b6469c406048479a6f75894451ab2c7867f697aa66f4f08a2", crc32: "7c9b89a2", fileSize: 3234923},
	{filename: "1_33RO20161119_hy1.csv", key: "38/e0/38e0394ad012dd1b6469c406048479a6f75894451ab2c7867f697aa66f4f08a2", crc32: "7c9b89a2", fileSize: 3234923},
	{filename: "2_33RO20161119_hy1.csv", key: "38/e0/38e0394ad012dd1b6469c406048479a6f75894451ab2c7867f697aa66f4f08a2", crc32: "7c9b89a2", fileSize: 3234923},
	{filename: "3_33RO20161119_hy1.csv", key: "38/e0/38e0394ad012dd1b6469c406048479a6f75894451ab2c7867f697aa66f4f08a2", crc32: "7c9b89a2", fileSize: 3234923},
	{filename: "4_33RO20161119_hy1.csv", key: "38/e0/38e0394ad012dd1b6469c406048479a6f75894451ab2c7867f697aa66f4f08a2", crc32: "7c9b89a2", fileSize: 3234923},
	{filename: "5_33RO20161119_hy1.csv", key: "38/e0/38e0394ad012dd1b6469c406048479a6f75894451ab2c7867f697aa66f4f08a2", crc32: "7c9b89a2", fileSize: 3234923},
	{filename: "6_33RO20161119_hy1.csv", key: "38/e0/38e0394ad012dd1b6469c406048479a6f75894451ab2c7867f697aa66f4f08a2", crc32: "7c9b89a2", fileSize: 3234923},
	{filename: "7_33RO20161119_hy1.csv", key: "38/e0/38e0394ad012dd1b6469c406048479a6f75894451ab2c7867f697aa66f4f08a2", crc32: "7c9b89a2", fileSize: 3234923},
]

interface R2ZipInfo {
	filename: string,
	key: string,
	crc32: string,
	fileSize: number,
}

const dosDate = (date: Date): number => {
	return date.getDate() | (date.getMonth() + 1) << 5 | (date.getFullYear() - 1980) << 9
}

const dosTime = (date: Date): number => {
	return (date.getSeconds() >> 1 | date.getMinutes() << 5 | date.getHours() << 11)
}

// TODO maybe get last mod times from the R2ZipInfo, since we have that information external

const locaFileHeader = (zi: R2ZipInfo, moddate: Date) => {
	const encodedFilename = UTF8.encode(zi.filename);

	const buffer = new DataView(new ArrayBuffer(ZIP_LOCAL_FILE_HEADER_LENGTH + encodedFilename.byteLength));

	buffer.setUint32(0, ZIP_LOCAL_FILE_HEADER_MAGIC_NUMBER);  // set magic number
	buffer.setUint16(4, ZIP_VERSION, true); // set min version
	// General purpose bit flag (bytes 6 and 7) remain zero since we will know the crc32 and compression is "stored"
	// Compression method (bytes 8 and 9) remain 0 for "stored"
	buffer.setUint16(10, dosTime(moddate), true);
	buffer.setUint16(12, dosDate(moddate), true);

	buffer.setUint32(14, parseInt(zi.crc32, 16), true);

	buffer.setUint32(18, zi.fileSize, true);
	buffer.setUint32(22, zi.fileSize, true);
	buffer.setUint16(26, encodedFilename.byteLength, true);
	// no extra field
	const uint8view = new Uint8Array(buffer.buffer)
	uint8view.set(encodedFilename, ZIP_LOCAL_FILE_HEADER_LENGTH)
	return uint8view
};

const centralDirectoryRecord = (zi: R2ZipInfo, fileOffset: number, moddate: Date) => {
	const encodedFilename = UTF8.encode(zi.filename);

	const buffer = new DataView(new ArrayBuffer(ZIP_CENTRAL_DIRECTORY_LENGTH + encodedFilename.byteLength));

	buffer.setUint32(0, ZIP_CENTRAL_DIRECTORY_MAGIC_NUMEBR);  // set magic number
	buffer.setUint16(4, ZIP_VERSION_UNIX, true); // set min version (made by, unix)
	buffer.setUint16(6, ZIP_VERSION, true); // set min version (needed to uncompress)
	// General purpose bit flag (bytes 6 and 7) remain zero since we will know the crc32 and compression is "stored"
	// Compression method (bytes 8 and 9) remain 0 for "stored"
	buffer.setUint16(12, dosTime(moddate), true);
	buffer.setUint16(14, dosDate(moddate), true);

	buffer.setUint32(16, parseInt(zi.crc32, 16), true);

	buffer.setUint32(20, zi.fileSize, true);
	buffer.setUint32(24, zi.fileSize, true);
	buffer.setUint16(28, encodedFilename.byteLength, true);
	// no extra field (offset 30, 2 bytes)
	// no file comments (offset 32, 2 bytes)
	// no disk numbers (offset 34, 2 bytes) though maybe set to FFFF once zip64 added
	// no internal attrs (offset 36, 2 bytes)
	buffer.setUint16(40, 0x644, true); // probably the most confusing, only the low bits being set (actual external attrs start at offset 38)
	buffer.setUint32(42, fileOffset);
	const uint8view = new Uint8Array(buffer.buffer)
	uint8view.set(encodedFilename, ZIP_CENTRAL_DIRECTORY_LENGTH)
	return uint8view
};

const endOfCentralDirectory = (centralDirectoryRecords: Map<string, Uint8Array>, fileOffset: number, centralDirectorySize: number): Uint8Array => {

	const buffer = new DataView(new ArrayBuffer(ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH));
	buffer.setUint32(0, ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC_NUMBER);
	// no number of this disk (offset 4, 2 bytes)
	// no disk of the central directory (offset 6, 2 bytes)
	buffer.setUint16(8, centralDirectoryRecords.size, true); // number of records on this disk
	buffer.setUint16(10, centralDirectoryRecords.size, true); // total number of records
	buffer.setUint32(12, centralDirectorySize, true);
	buffer.setUint32(16, fileOffset + centralDirectorySize, true);
	// no comments (offset 20, byte 2)
	return new Uint8Array(buffer.buffer)
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const hdofs = env.HDOFS;
		const moddate = new Date(); // matches behavior of mod_zip which uses "now"

		const localFileHeaders: Map<string, Uint8Array> = new Map();
		const centralDirectoryRecords: Map<string, Uint8Array> = new Map();

		let ptr = 0; // need to keep track of the byteOffsets
		for (const item of DATA_KEYS2) {
			const mapKey = item.filename; //use the filename as the key for above because having duplicates is... bad
			if (localFileHeaders.has(mapKey)) {
				return new Response("bad request", { status: 500 });
			}
			const lfh = locaFileHeader(item, moddate);
			localFileHeaders.set(mapKey, lfh);

			const cdr = centralDirectoryRecord(item, ptr, moddate);
			centralDirectoryRecords.set(mapKey, cdr)

			ptr += item.fileSize + lfh.byteLength;
		}
		// ptr should now be at the start of the central directory
		const centralDirectorySize = Array.from(centralDirectoryRecords.values()).reduce((a, cur) => a + cur.byteLength, 0);
		const ecod = endOfCentralDirectory(centralDirectoryRecords, ptr, centralDirectorySize);

		let { readable, writable } = new FixedLengthStream(ptr + centralDirectorySize + ecod.byteLength);

		//Cloudflare best practice
		const pipeEm = (async () => {
			for (const item of DATA_KEYS2) {
				const response = await hdofs.get(item.key);
				if (response?.body) {
					await ReadableStream.from([localFileHeaders.get(item.filename)]).pipeTo(writable, { preventClose: true });
					await response.body.pipeTo(writable, {preventClose: true})
				}
			}
			await ReadableStream.from(centralDirectoryRecords.values()).pipeTo(writable, { preventClose: true });
			await ReadableStream.from([ecod]).pipeTo(writable, { preventClose: true });
			await writable.close();
		})();


		return new Response(readable, {headers: {"Content-Type": "application/zip", "Content-Disposition": "attachment; filename=test.zip"}});
	},
} satisfies ExportedHandler<Env>;
