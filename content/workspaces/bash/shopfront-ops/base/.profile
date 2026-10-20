# ~/.profile: read by login shells (a new terminal is one). Bash skips it
# when ~/.bash_profile or ~/.bash_login exists.

# Bash login shells also get the interactive settings in ~/.bashrc.
if [ -n "$BASH_VERSION" ]; then
    if [ -f "$HOME/.bashrc" ]; then
        . "$HOME/.bashrc"
    fi
fi

# Your own commands: ~/bin comes first in PATH when the folder exists.
if [ -d "$HOME/bin" ]; then
    PATH="$HOME/bin:$PATH"
fi

if [ -d "$HOME/.local/bin" ]; then
    PATH="$HOME/.local/bin:$PATH"
fi
