# Local CV extraction trial

Date: 2026-11-01. A separate technical experiment, with no application changes, no real CV and no AI calls. The synthetic scan.pdf is a blank page without a text layer; it is not a test of OCR or of a real scan with an image.

`pdfjs-dist` 6.4.299 and `mammoth` 1.13.0 were chosen. Versions and engines were read from npm; the first requires Node >=22.13 or >=24, the second >=12. The trial passed on Node 24.15.0, which the project uses. The libraries are pinned in a separate package.json/lockfile; they were not added to the application's dependencies.

Reproduction without modifying the application's node_modules, from the project directory:

```sh
docker compose run --rm --no-deps -v "$PWD/docs/research/profil-import-spike:/spike" tools sh -c 'cd /spike && pnpm install --ignore-scripts && node check.mjs'
```

Result:

| Sample | Observation |
| --- | --- |
| text.pdf | 1 page, 43 characters, the order of two control lines preserved. |
| scan.pdf | 1 page, 0 characters — the need to paste text can be detected. |
| text.docx | 54 characters, Polish letters preserved, 0 Mammoth messages. |
| Invalid PDF bytes | Rejected; a diagnostic PDF.js message about indexing a broken document. |

PDF.js imports the legacy variant for Node; a local directory of standard fonts was specified. getTextContent was used, without rendering pages. Mammoth calls extractRawText, without generating HTML and without access to external files. Basis: [PDF.js example for Node](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs), [Mammoth API](https://github.com/mwilliamson/mammoth.js#api).

The trial confirms that the basic path is compatible. It does not prove reading quality for multi-column CVs, tables, unusual fonts, encrypted files, memory limits or the safety of every document. These cases, and keeping the original after a failure, require implementation tests. No external service received any CV.
