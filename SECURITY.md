# PenS Security IPC Inventory

This table tracks all IPC channels exposed to the renderer process, their allowed callers, input schema, and what resources they touch. 
Rate limits are applied to sensitive channels (marked with *).

| Channel | Allowed Caller | Input Schema | What it touches |
|---|---|---|---|
| dialog:openPdf | pens:// app frame | none | Opens native file dialog for PDFs |
| store:save | pens:// app frame | [string(255), any] | Writes ink JSON data to profile notes folder |
| store:load | pens:// app frame | [string(255)] | Reads ink JSON data from profile notes folder |
| store:list | pens:// app frame | none | Lists files in profile notes folder |
| get-username | pens:// app frame | none | Reads OS username |
| profiles:get-all | pens:// app frame | none | Reads global profiles.json |
| profiles:create | pens:// app frame | [string(50), string(30), string(10)] | Modifies global profiles.json |
| profiles:open | pens:// app frame | [string(32)] | Spawns a new BrowserWindow |
| get-preload-path | pens:// app frame | none | Returns static path to preload |
| bookmarks:get | pens:// app frame | none | Reads profile bookmarks.json |
| bookmarks:add | pens:// app frame | [url(2000), string(200)] | Modifies profile bookmarks.json |
| bookmarks:remove | pens:// app frame | [string(50)] | Modifies profile bookmarks.json |
| history:add | pens:// app frame | [url(2000), string(200)] | Modifies profile history.jsonl |
| history:get | pens:// app frame | none | Reads profile history.jsonl |
| history:clear | pens:// app frame | none | Deletes profile history.jsonl |
| settings:get | pens:// app frame | none | Reads profile settings.json |
| settings:save | pens:// app frame | [any] | Modifies profile settings.json |
| downloads:get | pens:// app frame | none | Reads profile downloads.json |
| privacy:clear-data * | pens:// app frame | none | Clears profile session storage (cookies, cache) |
| passwords:get * | pens:// app frame | none | Reads and decrypts profile passwords.enc |
| passwords:add | pens:// app frame | [url(2000), string(255), string(255)] | Modifies and encrypts profile passwords.enc |
| sync:export * | pens:// app frame | none | Native save dialog, exports profile folder to zip |
| webview:printToPdf | pens:// app frame | [number] | Triggers WebContents.printToPDF, writes to disk |

**Rate Limits:** Channels marked with `*` are rate-limited to 1 request per 2 seconds per profile to prevent brute-forcing or rapid successive prompts.
