@echo off
rem Creates a desktop shortcut to El7arka.exe in this folder (portable package).
rem WScript.Shell cannot save non-ASCII file names, so the shortcut is saved under an ASCII name and then renamed.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$exe = Join-Path '%~dp0' 'El7arka.exe'; $desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$tmp = Join-Path $desktop 'El7arka-shortcut.lnk';" ^
  "$lnk = Join-Path $desktop ([string][char]0x0627 + [char]0x0644 + [char]0x062D + [char]0x0631 + [char]0x0643 + [char]0x0629 + '.lnk');" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($tmp);" ^
  "$s.TargetPath = $exe; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = $exe + ',0'; $s.Save();" ^
  "Move-Item -LiteralPath $tmp -Destination $lnk -Force;" ^
  "Write-Host ('Shortcut created: ' + $lnk)"
pause
