# Playground

This is your playground: a folder on your computer for trying anything, a few
files or a whole project, in any language. It shows here the way VS Code
would, with the Explorer on the left, the editor with a tab for each file you
open, and a terminal under it.

- Explorer: this folder's files. Its buttons, or a right-click on an empty
  spot, make files and folders. Click a file to open it in a tab. Cmd+B
  (Ctrl+B on Windows) folds the Explorer away and back.
- Editor: what you type is saved a moment after you stop. Cmd+P (Ctrl+P on
  Windows) opens a file by its name.
- Terminal: a real shell on your computer, in this folder, so your own tools
  and logins work there (git, node, python, npm, Claude Code, anything you've
  installed). It isn't a sandbox: what you run there runs on your computer,
  like in any terminal window. Ctrl+` moves between it and the editor, its
  border drags, and the button on its bar folds it away.
- The terminal keeps running when you leave (with tmux installed) and comes
  back as you left it. Typing exit ends it.
- When a tool in the terminal changes a file that was already here, its tab
  shows the change for you to accept or reject. Files a tool makes just
  appear in the Explorer.

There's no Run button here: run things in the terminal (node app.js,
python3 main.py, npm run dev). A server you start there opens in a new tab
from the link it prints. To find this folder, type pwd in the terminal.
Delete this file whenever you like.
