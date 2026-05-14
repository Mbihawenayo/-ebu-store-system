$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\EBUE\Desktop\EBU Store.lnk")
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"C:\Users\EBUE\Documents\Management System\EBU_Store_Launcher.vbs`""
$Shortcut.WorkingDirectory = "C:\Users\EBUE\Documents\Management System"
$Shortcut.WindowStyle = 1
$Shortcut.Description = "Launch EBU Store Management System"
$Shortcut.Save()
