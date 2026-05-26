Place the built ZopyPrinter.exe and pdfium.dll here.

Build steps:
  cd native/ZopyPrinter
  dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
  cp bin/Release/net8.0-windows/win-x64/publish/* ../../resources/ZopyPrinter/
