# ZopyPrinter — Native PDF Print Helper

A C# console app that prints PDFs using Windows native GDI printing via pdfium.
Replaces SumatraPDF (used by `pdf-to-printer`) for faster, atomic batch printing.

## Why?

| | pdf-to-printer (SumatraPDF) | ZopyPrinter (pdfium GDI) |
|---|---|---|
| Speed | Spawns SumatraPDF per file (slow) | Single process, pre-loads all PDFs |
| Batching | Separate spooler jobs (can interleave) | Tight-loop printing (near-zero gap) |
| Quality | Rasterized by Sumatra | Direct GDI render to printer driver |

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) (Windows)
- `pdfium.dll` — download from [nickkoro02/pdfium-lib releases](https://github.com/nickkoro02/pdfium-lib/releases)
  - Get the **win-x64** build
  - Extract `pdfium.dll` into this folder (`native/ZopyPrinter/pdfium.dll`)

## Build

```bash
cd native/ZopyPrinter

# Place pdfium.dll in this directory first!
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true

# Copy output to Electron resources
mkdir -p ../../resources/ZopyPrinter
cp bin/Release/net8.0-windows/win-x64/publish/* ../../resources/ZopyPrinter/
```

## Usage

```bash
# Print a batch of files
ZopyPrinter.exe config.json

# List available printers
ZopyPrinter.exe --list-printers
```

### Config JSON format

```json
{
  "printer": "HP LaserJet Pro",
  "files": [
    {
      "path": "C:\\temp\\document1.pdf",
      "copies": 1,
      "duplex": "simplex",
      "orientation": "portrait",
      "paperSize": "A4",
      "monochrome": true,
      "pages": "",
      "scale": "fit"
    },
    {
      "path": "C:\\temp\\document2.pdf",
      "copies": 2,
      "duplex": "duplexlong",
      "orientation": "landscape",
      "paperSize": "A4",
      "monochrome": false,
      "pages": "1-3",
      "scale": "shrink"
    }
  ]
}
```

### Options

| Field | Values | Default |
|-------|--------|---------|
| `duplex` | `simplex`, `duplexlong`, `duplexshort` | `simplex` |
| `orientation` | `portrait`, `landscape` | `portrait` |
| `scale` | `fit`, `shrink`, `noscale` | `fit` |
| `monochrome` | `true`, `false` | `true` |
| `pages` | `""` (all), `"1-5"`, `"3"` | `""` |

### Stdout output (JSON lines)

The exe outputs progress as JSON lines to stdout for Electron to parse:

```jsonl
{"type":"progress","fileIndex":0,"totalFiles":2,"percent":0,"fileName":"doc1.pdf","status":"loading"}
{"type":"progress","fileIndex":0,"totalFiles":2,"percent":50,"fileName":"doc1.pdf","status":"printing"}
{"type":"progress","fileIndex":0,"totalFiles":2,"percent":100,"fileName":"doc1.pdf","status":"done"}
{"type":"progress","fileIndex":1,"totalFiles":2,"percent":50,"fileName":"doc2.pdf","status":"printing"}
{"type":"progress","fileIndex":1,"totalFiles":2,"percent":100,"fileName":"doc2.pdf","status":"done"}
{"type":"complete","totalFiles":2}
```

## How it works

1. **Pre-load phase**: Opens all PDFs and creates PrintDocument objects with settings
2. **Print phase**: Fires `.Print()` in a tight loop — near-zero gap between spooler jobs
3. **Cleanup**: Disposes resources and exits

This ensures all files from one job are queued contiguously in the Windows spooler,
preventing interleaving from other PCs printing to the same printer.
