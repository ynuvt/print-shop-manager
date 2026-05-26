using System;
using System.Drawing.Printing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Collections.Generic;

namespace ZopyPrinter
{
    class Program
    {
        [DllImport("pdfium.dll")]
        public static extern void FPDF_InitLibrary();
        
        [DllImport("pdfium.dll")]
        public static extern void FPDF_DestroyLibrary();
        
        [DllImport("pdfium.dll", CharSet = CharSet.Ansi)]
        public static extern IntPtr FPDF_LoadDocument(string file_path, string password);
        
        [DllImport("pdfium.dll")]
        public static extern void FPDF_CloseDocument(IntPtr document);
        
        [DllImport("pdfium.dll")]
        public static extern int FPDF_GetPageCount(IntPtr document);
        
        [DllImport("pdfium.dll")]
        public static extern IntPtr FPDF_LoadPage(IntPtr document, int page_index);
        
        [DllImport("pdfium.dll")]
        public static extern void FPDF_ClosePage(IntPtr page);

        [DllImport("pdfium.dll")]
        public static extern double FPDF_GetPageWidth(IntPtr page);

        [DllImport("pdfium.dll")]
        public static extern double FPDF_GetPageHeight(IntPtr page);
        
        [DllImport("pdfium.dll")]
        public static extern void FPDF_RenderPage(IntPtr dc, IntPtr page, int start_x, int start_y, int size_x, int size_y, int rotate, int flags);

        const int FPDF_PRINTING = 0x800; // 2048
        const int FPDF_ANNOT = 0x01; // 1

        public class PrintConfig
        {
            public string PrinterName { get; set; } = "";
            public List<PrintFile> Files { get; set; } = new List<PrintFile>();
            public string PrintRunId { get; set; } = "";
        }

        public class PrintFile
        {
            public string Path { get; set; } = "";
            public int Copies { get; set; } = 1;
            public string PaperSize { get; set; } = "A4";
            public string ColorMode { get; set; } = "BW";
            public string Duplex { get; set; } = "ONE";
            public string Orientation { get; set; } = "PORTRAIT";
            public int PagesPerSheet { get; set; } = 1;
            public string Pages { get; set; } = ""; // e.g. "1-3,5"
            public string Scale { get; set; } = "fit"; // noscale, fit, shrink
            public string Id { get; set; } = "";
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct PRINTER_INFO_2
        {
            public string pServerName;
            public string pPrinterName;
            public string pShareName;
            public string pPortName;
            public string pDriverName;
            public string pComment;
            public string pLocation;
            public IntPtr pDevMode;
            public string pSepFile;
            public string pPrintProcessor;
            public string pDatatype;
            public string pParameters;
            public IntPtr pSecurityDescriptor;
            public uint Attributes;
            public uint Priority;
            public uint DefaultPriority;
            public uint StartTime;
            public uint UntilTime;
            public uint Status;
            public uint cJobs;
            public uint AveragePPM;
        }

        [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern bool EnumPrinters(int flags, string? name, int level, IntPtr pPrinterEnum, int cbBuf, out int pcbNeeded, out int pcReturned);

        private const int PRINTER_ENUM_LOCAL = 0x00000002;
        private const int PRINTER_ENUM_CONNECTIONS = 0x00000004;

        static void Main(string[] args)
        {
            AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
            {
                var ex = e.ExceptionObject as Exception;
                Console.WriteLine($"{{\"type\":\"error\",\"message\":\"FATAL UNHANDLED EXCEPTION: {ex?.Message.Replace("\"", "\\\"").Replace("\n", " ")}\"}}");
                Environment.Exit(1);
            };

            if (args.Length > 0 && args[0] == "--warmup")
            {
                try 
                { 
                    FPDF_InitLibrary(); 
                    FPDF_DestroyLibrary(); 
                    Console.WriteLine("{\"type\":\"warmup_complete\"}");
                    Environment.Exit(0);
                } 
                catch (Exception ex)
                {
                    Console.WriteLine($"{{\"type\":\"error\",\"message\":\"Warmup failed: {ex.Message.Replace("\"", "\\\"")}\"}}");
                    Environment.Exit(1);
                }
            }

            if (args.Length > 0 && args[0] == "--list-printers")
            {
                try
                {
                    var printers = new List<object>();
                    foreach (string printer in PrinterSettings.InstalledPrinters)
                    {
                        try
                        {
                            var settings = new PrinterSettings { PrinterName = printer };
                            printers.Add(new { name = printer, isDefault = settings.IsDefaultPrinter });
                        }
                        catch
                        {
                            printers.Add(new { name = printer, isDefault = false });
                        }
                    }

                    // Fallback to Win32 API if .NET list is empty
                    if (printers.Count == 0)
                    {
                        int pcbNeeded = 0;
                        int pcReturned = 0;
                        int flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
                        
                        EnumPrinters(flags, null, 2, IntPtr.Zero, 0, out pcbNeeded, out pcReturned);
                        if (pcbNeeded > 0)
                        {
                            IntPtr pAddr = Marshal.AllocHGlobal(pcbNeeded);
                            if (EnumPrinters(flags, null, 2, pAddr, pcbNeeded, out pcbNeeded, out pcReturned))
                            {
                                int structSize = Marshal.SizeOf(typeof(PRINTER_INFO_2));
                                for (int i = 0; i < pcReturned; i++)
                                {
                                    IntPtr current = new IntPtr(pAddr.ToInt64() + (i * structSize));
                                    PRINTER_INFO_2 info = Marshal.PtrToStructure<PRINTER_INFO_2>(current);
                                    if (!string.IsNullOrEmpty(info.pPrinterName))
                                    {
                                        printers.Add(new { name = info.pPrinterName, isDefault = (info.Attributes & 0x00000004) != 0 });
                                    }
                                }
                            }
                            Marshal.FreeHGlobal(pAddr);
                        }
                    }

                    Console.WriteLine(JsonSerializer.Serialize(new { type = "printers", printers }));
                    Environment.Exit(0);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"{{\"type\":\"error\",\"message\":\"Failed to list printers: {ex.Message.Replace("\"", "\\\"")}\"}}");
                    Environment.Exit(1);
                }
            }

            if (args.Length == 0)
            {
                Console.WriteLine("{\"type\":\"error\",\"message\":\"No config file provided.\"}");
                Environment.Exit(1);
            }

            string configPath = args[0];
            if (!File.Exists(configPath))
            {
                Console.WriteLine("{\"type\":\"error\",\"message\":\"Config file not found.\"}");
                Environment.Exit(1);
            }

            PrintConfig? config = null;
            try
            {
                string json = File.ReadAllText(configPath);
                config = JsonSerializer.Deserialize<PrintConfig>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"{{\"type\":\"error\",\"message\":\"Failed to parse config: {ex.Message.Replace("\"", "\\\"")}\"}}");
                Environment.Exit(1);
            }

            if (config == null || config.Files == null || config.Files.Count == 0)
            {
                Console.WriteLine("{\"type\":\"error\",\"message\":\"No files to print.\"}");
                Environment.Exit(1);
            }

            try
            {
                FPDF_InitLibrary();

                foreach (var file in config.Files)
                {
                    if (!File.Exists(file.Path))
                    {
                        Console.WriteLine($"{{\"type\":\"error\",\"fileId\":\"{file.Id}\",\"message\":\"File not found: {file.Path.Replace("\\", "\\\\")}\"}}");
                        continue;
                    }

                    IntPtr doc = FPDF_LoadDocument(file.Path, null!);
                    if (doc == IntPtr.Zero)
                    {
                        Console.WriteLine($"{{\"type\":\"error\",\"fileId\":\"{file.Id}\",\"message\":\"Failed to load PDF.\"}}");
                        continue;
                    }

                    int pageCount = FPDF_GetPageCount(doc);

                    using (var pd = new PrintDocument())
                    {
                        if (!string.IsNullOrEmpty(config.PrinterName))
                        {
                            pd.PrinterSettings.PrinterName = config.PrinterName;
                        }
                        
                        pd.PrinterSettings.Copies = (short)Math.Max(1, file.Copies);

                        if (file.Duplex.Equals("BOTH", StringComparison.OrdinalIgnoreCase) || 
                            file.Duplex.Equals("LONG", StringComparison.OrdinalIgnoreCase) ||
                            file.Duplex.Equals("DUPLEXLONG", StringComparison.OrdinalIgnoreCase))
                        {
                            pd.PrinterSettings.Duplex = Duplex.Vertical;
                        }
                        else if (file.Duplex.Equals("SHORT", StringComparison.OrdinalIgnoreCase) ||
                                 file.Duplex.Equals("DUPLEXSHORT", StringComparison.OrdinalIgnoreCase))
                        {
                            pd.PrinterSettings.Duplex = Duplex.Horizontal;
                        }
                        else
                        {
                            pd.PrinterSettings.Duplex = Duplex.Simplex;
                        }

                        bool isColor = file.ColorMode.Equals("COLOR", StringComparison.OrdinalIgnoreCase);
                        bool isLandscape = file.Orientation.Equals("LANDSCAPE", StringComparison.OrdinalIgnoreCase);

                        pd.PrinterSettings.DefaultPageSettings.Color = isColor;
                        pd.PrinterSettings.DefaultPageSettings.Landscape = isLandscape;

                        pd.DefaultPageSettings.Color = isColor;
                        pd.DefaultPageSettings.Landscape = isLandscape;

                        // Paper size handling
                        if (!string.IsNullOrEmpty(file.PaperSize))
                        {
                            foreach (PaperSize size in pd.PrinterSettings.PaperSizes)
                            {
                                if (size.Kind.ToString().Equals(file.PaperSize, StringComparison.OrdinalIgnoreCase) || 
                                    size.PaperName.Equals(file.PaperSize, StringComparison.OrdinalIgnoreCase))
                                {
                                    pd.DefaultPageSettings.PaperSize = size;
                                    break;
                                }
                            }
                        }

                        // Parse page ranges
                        List<int> pagesToPrint = new List<int>();
                        if (pageCount > 0)
                        {
                            if (!string.IsNullOrEmpty(file.Pages))
                            {
                                var uniquePages = new HashSet<int>();
                                foreach (var part in file.Pages.Split(','))
                                {
                                    var range = part.Trim().Split('-');
                                    if (range.Length == 2 && int.TryParse(range[0], out int start) && int.TryParse(range[1], out int end))
                                    {
                                        for (int i = start; i <= end; i++)
                                        {
                                            int clamped = Math.Max(0, Math.Min(i - 1, pageCount - 1));
                                            if (uniquePages.Add(clamped))
                                            {
                                                pagesToPrint.Add(clamped);
                                            }
                                        }
                                    }
                                    else if (int.TryParse(part.Trim(), out int p))
                                    {
                                        int clamped = Math.Max(0, Math.Min(p - 1, pageCount - 1));
                                        if (uniquePages.Add(clamped))
                                        {
                                            pagesToPrint.Add(clamped);
                                        }
                                    }
                                }
                            }
                            else
                            {
                                for (int i = 0; i < pageCount; i++) pagesToPrint.Add(i);
                            }
                        }

                        int currentIdx = 0;
                        int pps = file.PagesPerSheet > 0 ? file.PagesPerSheet : 1;

                        pd.PrintPage += (sender, e) =>
                        {
                            if (e.Graphics == null)
                            {
                                e.HasMorePages = false;
                                return;
                            }
                            int dpiX = (int)e.Graphics.DpiX;
                            int dpiY = (int)e.Graphics.DpiY;

                            // Full printable area in pixels
                            int fullWidth = (int)((e.PageBounds.Width / 100.0f) * dpiX);
                            int fullHeight = (int)((e.PageBounds.Height / 100.0f) * dpiY);
                            
                            // Offsets for hard margins
                            int offsetX = (int)(-(e.PageSettings.HardMarginX / 100.0f) * dpiX);
                            int offsetY = (int)(-(e.PageSettings.HardMarginY / 100.0f) * dpiY);

                            int rows = 1, cols = 1;
                            bool isLandscape = e.PageSettings.Landscape;
                            if (pps > 1) {
                                if (pps <= 2) { 
                                    if (isLandscape) { rows = 1; cols = 2; }
                                    else { rows = 2; cols = 1; }
                                }
                                else if (pps <= 4) { rows = 2; cols = 2; }
                                else if (pps <= 6) { 
                                    if (isLandscape) { rows = 2; cols = 3; }
                                    else { rows = 3; cols = 2; }
                                }
                                else if (pps <= 9) { rows = 3; cols = 3; }
                                else { 
                                    if (isLandscape) { rows = 3; cols = 4; }
                                    else { rows = 4; cols = 3; }
                                }
                            }

                            int cellWidth = fullWidth / cols;
                            int cellHeight = fullHeight / rows;

                            for (int p = 0; p < pps; p++)
                            {
                                if (currentIdx < pagesToPrint.Count)
                                {
                                    int pageIdx = pagesToPrint[currentIdx];
                                    if (pageCount > 0)
                                    {
                                        int targetPageIdx = Math.Max(0, Math.Min(pageIdx, pageCount - 1));
                                        IntPtr page = FPDF_LoadPage(doc, targetPageIdx);
                                        if (page != IntPtr.Zero)
                                        {
                                            double docW = FPDF_GetPageWidth(page);
                                            double docH = FPDF_GetPageHeight(page);

                                            // Determine rotation if needed (auto-rotate to match orientation)
                                            int rotate = 0;
                                            bool docIsLandscape = docW > docH;
                                            bool cellIsLandscape = cellWidth > cellHeight;
                                            if (docIsLandscape != cellIsLandscape) rotate = 1; // 90 deg

                                            if (rotate == 1) { var tmp = docW; docW = docH; docH = tmp; }

                                            // N-up layout: row-major order (left→right, top→bottom)
                                            // For 4-up (2×2): Page1=TopLeft, Page2=TopRight, Page3=BottomLeft, Page4=BottomRight
                                            // For 2-up portrait (1×2): Page1=Top, Page2=Bottom
                                            // For 2-up landscape (2×1): Page1=Left, Page2=Right
                                            int r = p / cols;  // row index (0 = top)
                                            int c = p % cols;  // column index (0 = left)

                                            double pad = 0.02; // 2% padding
                                            int w = (int)(cellWidth * (1 - 2*pad));
                                            int h = (int)(cellHeight * (1 - 2*pad));
                                            int cx = offsetX + c * cellWidth + (int)(cellWidth * pad);
                                            int cy = offsetY + r * cellHeight + (int)(cellHeight * pad);

                                            double scale = 1.0;
                                            if (file.Scale.Equals("fit", StringComparison.OrdinalIgnoreCase))
                                            {
                                                scale = Math.Min(w / docW, h / docH);
                                            }
                                            else if (file.Scale.Equals("shrink", StringComparison.OrdinalIgnoreCase))
                                            {
                                                scale = Math.Min(1.0, Math.Min(w / docW, h / docH));
                                            }
                                            else // noscale
                                            {
                                                scale = Math.Min(dpiX / 72.0, dpiY / 72.0); // assume 72dpi PDF points
                                            }

                                            int drawW = (int)(docW * scale);
                                            int drawH = (int)(docH * scale);
                                            int drawX = cx + (w - drawW) / 2;
                                            int drawY = cy + (h - drawH) / 2;

                                            IntPtr hdc = IntPtr.Zero;
                                            try
                                            {
                                                hdc = e.Graphics.GetHdc();
                                                FPDF_RenderPage(hdc, page, drawX, drawY, drawW, drawH, rotate, FPDF_PRINTING | FPDF_ANNOT);
                                            }
                                            finally
                                            {
                                                if (hdc != IntPtr.Zero)
                                                {
                                                    e.Graphics.ReleaseHdc(hdc);
                                                }
                                                FPDF_ClosePage(page);
                                            }
                                        }
                                    }
                                    currentIdx++;
                                }
                            }

                            e.HasMorePages = currentIdx < pagesToPrint.Count;

                            int percent = pagesToPrint.Count == 0 ? 100 : (int)((Math.Min(currentIdx, pagesToPrint.Count) / (float)pagesToPrint.Count) * 100);
                            Console.WriteLine($"{{\"type\":\"progress\",\"fileId\":\"{file.Id}\",\"percent\":{percent}}}");
                        };

                        pd.Print();
                    }

                    FPDF_CloseDocument(doc);
                }

                FPDF_DestroyLibrary();

                Console.WriteLine($"{{\"type\":\"complete\",\"printRunId\":\"{config.PrintRunId}\"}}");
                Environment.Exit(0);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"{{\"type\":\"error\",\"message\":\"Print loop error: {ex.Message.Replace("\"", "\\\"").Replace("\n", " ")}\"}}");
                Environment.Exit(1);
            }
        }
    }
}
