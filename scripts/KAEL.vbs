' KAEL autostart — brings up the local model server (Ollama), opens the app
' window, and runs the WATCHDOG, which supervises the hub itself (restart on
' crash with backoff, restart when hung via /api/health, logs under data/logs/).
' The outer loop here is only a second belt: if the watchdog process itself ever
' dies, it gets relaunched after 10s.
'
' Canonical copy — versioned in the repo at scripts/KAEL.vbs. Install/update:
'   copy scripts\KAEL.vbs "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KAEL.vbs"
Dim shell, q
q = Chr(34)
Set shell = CreateObject("WScript.Shell")

' 1) Ensure the free local model server is up. If Ollama is already running,
'    this just fails to bind :11434 and exits — harmless. Run hidden, no wait.
shell.Run q & "C:\Users\mealf\AppData\Local\Programs\Ollama\ollama.exe" & q & " serve", 0, False
WScript.Sleep 5000   ' give the model server a moment to bind the port

' 2) Open KAEL as its own APP WINDOW (Edge --app mode) once, after the hub has
'    had time to bind :3000. Detached and OUTSIDE the loop — a single window at
'    login, not one per relaunch. localhost keeps same-origin /api/* working and
'    the default profile keeps the granted mic permission.
shell.Run "cmd /c ping -n 10 127.0.0.1 > nul & " & q & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" & q & " --app=http://localhost:3000", 0, False

' 3) Run the watchdog (which runs and supervises server.js). Relaunch the
'    watchdog itself if it ever exits.
shell.CurrentDirectory = "C:\Users\mealf\gh-work\kael"
Do
  shell.Run q & "C:\Program Files\nodejs\node.exe" & q & " scripts\watchdog.mjs", 0, True
  WScript.Sleep 10000
Loop
