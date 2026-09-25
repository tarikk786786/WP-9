Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\tarik\Documents\wp bot"
WshShell.Run "cmd /c npm run live", 0, False
