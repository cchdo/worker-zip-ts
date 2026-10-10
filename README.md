# CCHDO Bulk Downloader
Enable streaming zip files of any[1] arbitrary collection of CCHDO file objects via a cloudflare worker.

Streaming responses are used everywhere and CPU times are 8 to 400ms depending on how many files are being bundled.
CPU times seem to average around 8~30ms.

Wall time is however long it takes to actually send the data to the client, can be many many minutes long.

There is currently no 64bit zip support as the largest download bundles at CCHDO do not need it.

## How it works
This was largely inspired by how the nginx mod_zip works.
It does not use compression and instead uses the "STORED" storage method.

Zip files are designed for streaming already, although not many libraries that make zipfiles appear to expose this functionality in obvious ways.
Zip files have the following and in this order:
* For each file/record:
	* local file header
	* file contents (empty in case of directory)
	* (optional) file data description
* Central Directory, essentially the above local file headers concatenated into one place
* End of Central Directory Record, basically a collection of byte offsets for the start of various parts of the file so it can be found quickly.

If a small amount of information about each file is known beforehand, all of the header and central directory information can be constructed in advance.
This allows, for example, the total size of the archive to be known before it is constructed.
Once all the zip specific parts of the file are known, the response generated is simply streaming all the chunks in the right order to the client.

The real CPU saving trick for cloudflare, and why most of the javascript zipfile libraries I tried did now work, is that the Response from the R2 bucket needs to be streamed directly to the client via the IdentityTransformStream that the cloudflare runtime provides and needs to bypass any other streaming mechanism.
In e.g. zip.js [2] the data stream is still chunked though even if no compression is requested, this crosses the worker/runtime boundary and results in high worker CPU usage.

## Compression?
Right now, this streaming technique doesn't support on the fly compression, however, there is a a potential way that compressed content could be returned: pre-compressing the files using gzip.
The gzip deflate stream is compatible with zip itself.

The steps would be as follows:
* Pre-compress each object at CCHDO using gzip (why not max compression since only do it once)
* Store these objects in a bucket (r2) with the gzip content-encoding headers
* These could then be directly return to the browser which will decompress things for the user transparently, or if the client doesn't support gzip, cloudflare itself may decompress files but not set the content-length headers.
* When it comes time to make the zip stream, 3 bit of additional information are needed in addition to what is already needed for the above STORED technique
	* File offset of the deflate stream start (cut off the gzip header, which is variable length)
	* File offset of the deflate stream end (cut off the gzip footer, which is often fixed length but you cannot seek from the end of the stream)
	* deflate stream size (can be calculated from above two)
* In the various zip headers, the deflate compression bits would be set
* When it comes time to stream the pre-compressed contents, a fetch to the r2 bucket with the right byte range would be streamed to the client.

In some offline tests, it's unclear how much space would actually be saved as most of the files at CCHDO seem to be zip/compressed already.
Only when bulk downloading the woce sum, exchange bottle files, or text cruise reports would any real savings occur.
This would however, allow the CCHDO "snapshot" archives to be streamed/generated directly from the website and not need a separate tool/utility for generating them, maybe except for making the final "BagIt" bag, although there are tricks for that too...

[1]: Any collection where the total is less than 4GB due to currently lack of 64bit extension support
[2]: https://gildas-lormeau.github.io/zip.js/
