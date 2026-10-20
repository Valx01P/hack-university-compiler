# ~/.bashrc: read by every interactive Bash shell. Login shells read it
# through ~/.profile.

# Scripts and `bash -c` are not interactive, so they skip the rest.
case $- in
  *i*) ;;
  *) return ;;
esac

# History: no duplicates or lines that start with a space, append to the
# history file instead of overwriting it, and keep a few thousand commands.
HISTCONTROL=ignoreboth
HISTSIZE=5000
HISTFILESIZE=10000
shopt -s histappend

# Recheck the window size after each command, so long lines wrap correctly.
shopt -s checkwinsize

# The prompt: user@host:directory$ (green and blue when the terminal has color).
case $TERM in
  xterm-color | *-256color)
    PS1='\[\e[01;32m\]\u@\h\[\e[00m\]:\[\e[01;34m\]\w\[\e[00m\]\$ '
    ;;
  *)
    PS1='\u@\h:\w\$ '
    ;;
esac

# Colors for ls and grep.
if [[ -x /usr/bin/dircolors ]]; then
  eval "$(dircolors -b)"
fi
alias ls='ls --color=auto'
alias grep='grep --color=auto'

# Listing shortcuts.
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'

# Tab completion for commands, options, git branches and more.
if ! shopt -oq posix; then
  if [[ -f /usr/share/bash-completion/bash_completion ]]; then
    . /usr/share/bash-completion/bash_completion
  elif [[ -f /etc/bash_completion ]]; then
    . /etc/bash_completion
  fi
fi
