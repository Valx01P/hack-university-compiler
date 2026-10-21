# Hack University Compiler

> The Hack University app: compilers, lessons, and real projects, running
> entirely on your own computer. Free.

If it helps you, please give it a star on GitHub. Stars help other students find
it, and they tell us what to build next.

Write and run **Python, JavaScript, TypeScript, C++, Java, Go, Bash, and SQL**
in the browser, and learn each one with short lessons, cheatsheets, and
challenges that check your answers. The project courses, **HTML, CSS & JS,
React, Next.js, Express, FastAPI, Spring Boot, and Go APIs**, open real
codebases in an IDE with terminals, a live preview, and real databases.

Everything runs on your computer, in Docker. Nothing leaves it.

![The Python compiler in the Dracula theme, with the stars on](docs/images/compiler-dracula.png)

![A Python lesson in Learn mode in the Solarized theme, with the stars on](docs/images/learn-solarized.png)

## Install

It works on a Mac and on a Windows PC, and you don't need to know how to code
to set it up. Follow the steps for your computer, and copy and paste each
command exactly as it is (the button at the top right of each box copies it).

**Before you start:** a computer with 16 GB of memory works best, since Docker,
which runs your code, needs 8 GB of it. You also need free disk space for what
you pick: about 1.2 GB for the basics, up to about 16 GB for everything.

### On a Mac

1. **Install Node.js.** Go to [nodejs.org](https://nodejs.org/en/download),
   download the **LTS** version's macOS Installer, open it, and click Continue
   until it's done.
2. **Install Docker Desktop.** Go to
   [docker.com](https://www.docker.com/products/docker-desktop/) and download
   Docker Desktop for Mac: **Apple Silicon** if your Mac has an Apple chip (M1
   or newer), **Intel** if it doesn't. Not sure? Open the Apple menu, choose
   About This Mac, and look at Chip. Open the download, drag Docker into
   Applications, then open Docker, accept the terms, and skip signing in. Wait
   until it says **Engine running**.

   With an Apple chip, also open Docker's **Settings**, then **General**, and
   turn on **Use Rosetta for x86_64/amd64 emulation on Apple Silicon**, so your
   code runs at full speed.
3. **Open Terminal.** Press **⌘ Command** and **Space** together, type
   **Terminal**, and press **Return**.
4. **Download Hack University and start it.** Paste these three lines into
   Terminal with **⌘ Command + V**, and press **Return**:

   ```bash
   git clone https://github.com/Valx01P/hack-university-compiler.git
   cd hack-university-compiler
   npm run up
   ```

   If your Mac asks to install the **command line developer tools**, click
   **Install**, wait for it to finish, then paste the three lines again.
5. **Pick what to install.** A list of the languages and courses shows up, with
   each one's size. The arrow keys move, **Space** ticks or unticks, and
   **Return** installs. The first download can take a while.
6. **Open it.** When Terminal says **Hack University is starting on
   http://localhost:3000**, open <http://localhost:3000> in your browser.

### On Windows

1. **Open Command Prompt.** Press the **Windows** key, type **cmd**, and press
   **Enter**. Use Command Prompt, not PowerShell, for every step here.
2. **Install Git, Node.js, and Docker Desktop.** Paste these three lines into
   Command Prompt with **Ctrl + V**, and press **Enter**. Click **Yes** each
   time Windows asks for permission:

   ```bat
   winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
   winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
   winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
   ```

   If it says winget isn't recognized, download them instead:
   [Git](https://git-scm.com/downloads/win), the **LTS** version of
   [Node.js](https://nodejs.org/en/download), and
   [Docker Desktop](https://www.docker.com/products/docker-desktop/). Run each
   installer and keep the options it starts with.

   When all three are installed, **restart your computer**.
3. **Start Docker Desktop.** Open **Docker Desktop** from the Start menu,
   accept the terms, and skip signing in. If it asks to install or update WSL,
   let it. Wait until it says **Engine running**.
4. **Download Hack University and start it.** Open Command Prompt again, paste
   these three lines, and press **Enter**:

   ```bat
   git clone https://github.com/Valx01P/hack-university-compiler.git
   cd hack-university-compiler
   npm run up
   ```
5. **Pick what to install.** A list of the languages and courses shows up, with
   each one's size. The arrow keys move, **Space** ticks or unticks, and
   **Enter** installs. The first download can take a while.
6. **Open it.** When Command Prompt says **Hack University is starting on
   http://localhost:3000**, open <http://localhost:3000> in your browser.

### Every time after that

Open Docker Desktop first. Then open Terminal (Mac) or Command Prompt (Windows)
and paste:

```bash
cd hack-university-compiler
npm run up
```

It starts in seconds. To stop it, press **Ctrl + C** in that window. On
Windows, if it asks **Terminate batch job (Y/N)?**, type **Y** and press
**Enter**.

## Pick what to install

| Compiler | Size | Project course | Size |
| --- | --- | --- | --- |
| Python | 1.1 GB | HTML, CSS & JS, React, and Next.js | 1.9 GB |
| JavaScript | 215 MB | Express | 3.6 GB |
| C++ | 2.8 GB | FastAPI | 1.4 GB |
| Java | 510 MB | Spring Boot | 1.5 GB |
| Go | 525 MB | Go APIs | 2.7 GB |
| TypeScript | 1.8 GB | | |
| Bash | 545 MB | | |

The app itself (lessons, cheatsheets, SQL, and search) is 1.2 GB and always
comes. Shared parts download once: Python, JavaScript, C++, Java, and Go share
a 1.4 GB sandbox, TypeScript shares its images with the web courses, and the
server courses share PostgreSQL. So the total is often less than the sum, and
the checklist shows the real total as you pick.

Change it any time:

```bash
npm run status              # what's installed, and how much space each takes
npm run add -- cpp spring   # install more
npm run remove -- cpp       # remove some and get the space back
npm run choose              # the checklist again
npm run clean               # clear Docker's leftover build files
```

`add` and `remove` show the size and ask before they change anything. If you
run something that isn't installed, the app tells you the command to add it.
To skip the checklist, use `npm run up -- --all` for everything or
`npm run up -- --minimal` for just the app.

With [Task](https://taskfile.dev) installed, `task`, `task add -- cpp`, and the
rest do the same.

## Troubleshooting

- **"command not found: npm"** (Mac) or **"'npm' is not recognized"**
  (Windows): Node.js isn't installed yet, or the window was open before you
  installed it. Install it, then open a new window (on Windows, restart your
  computer first).
- **"'git' is not recognized"** (Windows): restart your computer after
  installing Git, then open Command Prompt again.
- **Docker says virtualization isn't turned on** (Windows): it's a setting in
  your PC's startup menu (the BIOS). Search for your PC's brand and "enable
  virtualization" for the steps.
- **"sandbox offline"**: start Docker Desktop, then run `npm run up` again.
- **"isn't installed yet"**: run the `npm run add` command it shows, then
  reload the page.
- **Slow runs on a Mac**: turn on Rosetta in Docker Desktop (Mac step 2).
- **Port 3000 or 3100 is taken**: an earlier `npm run up` is probably still
  running, so stop it first. Or use other ports:
  `PORT=3001 HU_RUNNER_PORT=3101 npm run up` on a Mac, or
  `set "PORT=3001" && set "HU_RUNNER_PORT=3101" && npm run up` in Command
  Prompt.

## Learn more

[docs/guide.md](docs/guide.md) has everything else: every feature, the editor's
keys, the themes, how it all works, every script, and how to add a language.

## Credits

- Code execution by [Piston](https://github.com/engineer-man/piston) (MIT).
- SQL by [PGlite](https://github.com/electric-sql/pglite) (Apache 2.0 and the
  PostgreSQL License).
- Animations by [GSAP](https://gsap.com) (free under its standard "no charge"
  license).
- Cheatsheet search by [Model2Vec](https://github.com/MinishLab/model2vec)'s
  [potion-base-8M](https://huggingface.co/minishlab/potion-base-8M) (MIT).
- The Java coffee cup icon is from [Devicon](https://github.com/devicons/devicon)
  (MIT). The other language icons are from [Simple Icons](https://simpleicons.org)
  (CC0).
