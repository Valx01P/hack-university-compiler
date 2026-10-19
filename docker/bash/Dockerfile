# hu/bash: the Bash course's machine. Debian 13 with its GNU userland, plus
# Bash 5.3 (patch 20) and gawk 5.4.1 built from source, the official static jq
# 1.8.2 and ShellCheck 0.11.0, and bats-core 1.14.0 (decision D10). Used by the
# bash recipe (single-file Run and Check) and, from P1, Bash workspaces.
#
# The runner builds it from the docker/ folder (npm run up, or
# npm run images -- bash) and tags it hu/bash:<sha12> of everything it copies,
# so it rebuilds only when this file or its inputs change. Every download is
# pinned by SHA-256 in sources.sha256 or below. The GNU tarballs and patches
# were also checked against their signatures in gnu-keyring.gpg when pinned.

FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f AS build
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bison ca-certificates curl gcc libc6-dev libgmp-dev libmpfr-dev libncurses-dev \
      libreadline-dev make patch xz-utils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY bash/sources.sha256 ./
RUN set -eu; \
    gnu=https://ftp.gnu.org/gnu; \
    curl -fsSLO "$gnu/bash/bash-5.3.tar.gz"; \
    for n in $(seq -w 1 20); do curl -fsSLO "$gnu/bash/bash-5.3-patches/bash53-0$n"; done; \
    curl -fsSLO "$gnu/gawk/gawk-5.4.1.tar.xz"; \
    gh=https://github.com/bats-core; \
    curl -fsSL -o bats-core-1.14.0.tar.gz "$gh/bats-core/archive/refs/tags/v1.14.0.tar.gz"; \
    curl -fsSL -o bats-support-0.3.0.tar.gz "$gh/bats-support/archive/refs/tags/v0.3.0.tar.gz"; \
    curl -fsSL -o bats-assert-2.2.4.tar.gz "$gh/bats-assert/archive/refs/tags/v2.2.4.tar.gz"; \
    curl -fsSL -o bats-file-0.4.0.tar.gz "$gh/bats-file/archive/refs/tags/v0.4.0.tar.gz"; \
    sha256sum -c sources.sha256

# Bash 5.3 with every official patch. Upstream reads no system-wide bashrc, so
# turn on Debian's /etc/bash.bashrc and bash.bash_logout (the shell integration
# lives there), and drop the "." that upstream puts at the end of the default
# PATH.
RUN set -eu; \
    tar -xzf bash-5.3.tar.gz; \
    cd bash-5.3; \
    for p in ../bash53-0??; do patch -p0 -s < "$p"; done; \
    sed -i \
      -e 's|^/\* #define SYS_BASHRC "/etc/bash.bashrc" \*/|#define SYS_BASHRC "/etc/bash.bashrc"|' \
      -e 's|^/\* #define SYS_BASH_LOGOUT "/etc/bash.bash_logout" \*/|#define SYS_BASH_LOGOUT "/etc/bash.bash_logout"|' \
      -e 's|:/sbin:\."|:/sbin"|' \
      config-top.h; \
    grep -q '^#define SYS_BASHRC' config-top.h; \
    grep -q '^#define SYS_BASH_LOGOUT' config-top.h; \
    ./configure --prefix=/usr/local --without-bash-malloc > /dev/null; \
    make -j"$(nproc)" > /dev/null; \
    make install DESTDIR=/out > /dev/null; \
    strip /out/usr/local/bin/bash

# gawk 5.4.1: the awk lesson teaches --csv, which needs 5.3 or newer, and
# Debian 13 ships 5.2.1.
RUN set -eu; \
    tar -xJf gawk-5.4.1.tar.xz; \
    cd gawk-5.4.1; \
    ./configure --prefix=/usr/local > /dev/null; \
    make -j"$(nproc)" > /dev/null; \
    make install DESTDIR=/out > /dev/null; \
    strip /out/usr/local/bin/gawk

# The official static jq and ShellCheck binaries.
RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) jq=jq-linux-arm64; jq_sum=8b85c817833814ddca00a144c33705546355afccf0cf39b188f3cdb48b852309; \
             sc=aarch64; sc_sum=12b331c1d2db6b9eb13cfca64306b1b157a86eb69db83023e261eaa7e7c14588 ;; \
      amd64) jq=jq-linux-amd64; jq_sum=b1c22172dd303f3be49e935aa56aa48a8b7a46e0bc838b4997d3bb451495870f; \
             sc=x86_64; sc_sum=8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198 ;; \
      *) echo "hu/bash has no jq or ShellCheck pin for $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o jq "https://github.com/jqlang/jq/releases/download/jq-1.8.2/$jq"; \
    echo "$jq_sum  jq" | sha256sum -c -; \
    install -m 755 jq /out/usr/local/bin/jq; \
    curl -fsSL -o shellcheck.tar.xz "https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.$sc.tar.xz"; \
    echo "$sc_sum  shellcheck.tar.xz" | sha256sum -c -; \
    tar -xJf shellcheck.tar.xz; \
    install -m 755 shellcheck-v0.11.0/shellcheck /out/usr/local/bin/shellcheck

# bats-core, and its helper libraries where bats_load_library looks.
RUN set -eu; \
    for t in bats-core-1.14.0 bats-support-0.3.0 bats-assert-2.2.4 bats-file-0.4.0; do tar -xzf "$t.tar.gz"; done; \
    ./bats-core-1.14.0/install.sh /out/usr/local > /dev/null; \
    mkdir -p /out/usr/lib/bats; \
    for lib in bats-support-0.3.0 bats-assert-2.2.4 bats-file-0.4.0; do \
      name="${lib%-*}"; \
      mkdir -p "/out/usr/lib/bats/$name"; \
      cp -R "$lib/load.bash" "$lib/src" "/out/usr/lib/bats/$name/"; \
    done

# hu-exec is C, built static so it needs nothing in the final image.
COPY shared/hu-exec.c ./
RUN mkdir -p /out/opt/hu/bin \
 && gcc -O2 -Wall -Wextra -static -o /out/opt/hu/bin/hu-exec hu-exec.c

FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f

# Lesson 1 uses man, and the slim image leaves man pages out. Letting English
# pages in (docs and translations stay out) and reinstalling the base tools
# brings their pages back.
RUN sed -i 's|^path-exclude /usr/share/man/\*$|path-exclude /usr/share/man/??/*\npath-exclude /usr/share/man/??_*/*|' \
      /etc/dpkg/dpkg.cfg.d/docker \
 && grep -q '^path-exclude /usr/share/man/??/\*$' /etc/dpkg/dpkg.cfg.d/docker \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      bash-completion bc bsdextrautils bzip2 ca-certificates cron curl diffutils faketime file \
      git inotify-tools iproute2 less libgmp10 libmpfr6 libreadline8t64 lsof man-db manpages \
      manpages-dev nano netcat-openbsd patch procps psmisc python3 rsync socat sqlite3 sudo tree \
      unzip vim-tiny xz-utils zip \
 && apt-get install -y --no-install-recommends --reinstall \
      bash coreutils diffutils findutils grep gzip hostname login mount passwd sed tar util-linux \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/ /
COPY shared/bin/ /opt/hu/bin/

# Bash 5.3 answers to /bin/bash and /usr/bin/bash, so shebangs and
# `#!/usr/bin/env bash` both get it. gawk 5.4.1 is awk. /bin/sh stays dash,
# as on every Debian server.
RUN dpkg-divert --local --rename --divert /usr/bin/bash.debian --add /usr/bin/bash \
 && ln -s /usr/local/bin/bash /usr/bin/bash \
 && update-alternatives --install /usr/bin/awk awk /usr/local/bin/gawk 100

# learner (uid 1000) is in its own group and devs, with sudo inside the
# container (the sysadmin profile's lessons need it; jobs drop every
# capability, so sudo does nothing there).
RUN groupadd --gid 1000 learner \
 && groupadd --gid 1001 devs \
 && useradd --uid 1000 --gid learner --groups devs --create-home --home-dir /home/learner \
      --shell /bin/bash learner \
 && echo 'learner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/learner \
 && chmod 0440 /etc/sudoers.d/learner \
 && mkdir -p /work /srv \
 && chown learner:learner /work /srv

ENV HOME=/home/learner \
    HOST=0.0.0.0 \
    LANG=C.UTF-8 \
    TZ=UTC

# Fail the build if a pin drifted.
RUN test "$(bash -c 'echo "$BASH_VERSION"')" = "5.3.20(1)-release" \
 && test "$(/bin/bash -c 'echo "$BASH_VERSION"')" = "5.3.20(1)-release" \
 && awk --version | head -n 1 | grep -q '^GNU Awk 5\.4\.1' \
 && test "$(jq --version)" = jq-1.8.2 \
 && shellcheck --version | grep -q '^version: 0\.11\.0$' \
 && test "$(bats --version)" = "Bats 1.14.0" \
 && test "$(readlink -f /bin/sh)" = /usr/bin/dash

WORKDIR /home/learner
LABEL hu.versions="{\"bash\":\"5.3.20\",\"gawk\":\"5.4.1\",\"jq\":\"1.8.2\",\"shellcheck\":\"0.11.0\",\"bats\":\"1.14.0\"}"
