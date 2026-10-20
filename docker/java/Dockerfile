# hu/java: Java 25 (Temurin) with Maven 3.10.0 and a read-only Maven
# repository holding everything a Spring Boot 4.1.1 template builds with.
# Used by Spring Boot workspaces and by the spring recipe.
#
# The runner builds it from the docker/ folder (Prepare this course, or
# npm run images -- --stacks=spring) and tags it hu/java:<sha12> of everything
# this file copies and every Spring template's pom.xml, so a new template
# rebuilds it.
#
#   /opt/hu/m2                     the read-only repository, Maven's tail
#                                  (-Dmaven.repo.local.tail in MAVEN_ARGS).
#                                  ~/.m2/repository is the writable head
#   /opt/hu/maven-user             MAVEN_USER_HOME for ./mvnw: Maven 3.10.0 where
#                                  the wrapper looks for it, so ./mvnw works
#                                  offline when a template's
#                                  maven-wrapper.properties names the official
#                                  apache-maven-3.10.0-bin.zip URL
#   /opt/hu/spring/profiles/<p>/   the spring recipe's jar sets (core, boot, web,
#                                  data, secure), as links into /opt/hu/m2, for
#                                  javac -cp '/opt/hu/spring/profiles/web/*'

# hu-exec is C, built static so it needs nothing in the final image.
FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f AS hu-exec
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*
COPY shared/hu-exec.c /src/hu-exec.c
RUN gcc -O2 -Wall -Wextra -static -o /hu-exec /src/hu-exec.c

FROM eclipse-temurin:25-jdk@sha256:2d5d5e9b533342a565907c84f47a2ec298c40cde7b13a3ca85d4950fa456a641

# What a workspace terminal expects, plus socat for the port bridge and ss
# (iproute2) for finding what listens.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git iproute2 jq less nano procps socat tree unzip \
 && rm -rf /var/lib/apt/lists/*

RUN --mount=type=bind,source=pgdg,target=/tmp/pgdg sh /tmp/pgdg/install-psql

# Ubuntu's images name uid 1000 ubuntu, in sudo, adm, and six more groups.
# Every hu image runs as learner, in its own group only.
RUN if id -u ubuntu > /dev/null 2>&1; then \
      usermod --login learner --move-home --home /home/learner --shell /bin/bash --groups "" ubuntu \
      && groupmod --new-name learner ubuntu; \
    else \
      groupadd --gid 1000 learner \
      && useradd --uid 1000 --gid learner --create-home --home-dir /home/learner --shell /bin/bash learner; \
    fi \
 && test "$(id -u learner):$(id -g learner):$(id -G learner)" = 1000:1000:1000

# Maven 3.10.0, checked against the SHA-512 Maven Central publishes. The
# wrapper's folder for the official 3.10.0 URL (named by mvnw's hash of it,
# dae9a06d) links here, so ./mvnw never downloads.
RUN set -eu; \
    curl -fsSL -o /tmp/maven.tgz https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.10.0/apache-maven-3.10.0-bin.tar.gz; \
    echo "908b1501bfb420bf7c8affb855534a9c407fd6099367bfb9f2f2dcb8e9799102bffb84518cde74c679bd76870247c6528683abdd620581bffa90f95d92d175aa  /tmp/maven.tgz" | sha512sum -c -; \
    mkdir /opt/maven; \
    tar -xzf /tmp/maven.tgz -C /opt/maven --strip-components=1; \
    rm /tmp/maven.tgz; \
    ln -s /opt/maven/bin/mvn /usr/local/bin/mvn; \
    mkdir -p /opt/hu/maven-user/wrapper/dists/apache-maven-3.10.0; \
    ln -s /opt/maven /opt/hu/maven-user/wrapper/dists/apache-maven-3.10.0/dae9a06d

ENV MAVEN_OPTS="-Xmx384m -XX:TieredStopAtLevel=1 -XX:+UseSerialGC"

# The repository: build, test, verify, install, and run the bake projects,
# resolve the script profiles, and resolve every template's pom.xml (from the
# templates build context the runner stages, content/workspaces/spring/**).
COPY java/bake/ /tmp/bake/
COPY --from=templates . /tmp/templates/
RUN set -eu; \
    m="mvn -B -ntp -Dmaven.repo.local=/opt/hu/m2"; \
    cd /tmp/bake/app; \
    $m -N wrapper:wrapper -Dmaven=3.10.0 -Dtype=only-script; \
    $m clean install; \
    $m dependency:go-offline dependency:tree help:effective-pom > /dev/null; \
    cd /tmp/bake/run; \
    $m spring-boot:run | grep -q hu-run-ready; \
    $m package > /dev/null; \
    for p in core boot web data secure; do \
      cd "/tmp/bake/profiles/$p"; \
      $m dependency:build-classpath -Dmdep.outputFile="/tmp/$p.classpath" > /dev/null; \
      mkdir -p "/opt/hu/spring/profiles/$p"; \
      tr ':' '\n' < "/tmp/$p.classpath" | xargs -I{} ln -s {} "/opt/hu/spring/profiles/$p/"; \
      test "$(ls "/opt/hu/spring/profiles/$p" | wc -l)" -eq "$(tr ':' '\n' < "/tmp/$p.classpath" | grep -c .)"; \
    done; \
    mkdir -p /opt/hu/spring/profiles/java; \
    find /tmp/templates -name pom.xml | sort | while read -r pom; do \
      echo "template pom: ${pom#/tmp/templates/}"; \
      $m -f "$pom" dependency:go-offline > /dev/null; \
    done; \
    cp -R /tmp/bake/app/mvnw /tmp/bake/app/.mvn /opt/hu/maven-user/; \
    rm -rf /opt/hu/m2/hu/bake /tmp/bake /tmp/templates /tmp/*.classpath /root/.m2; \
    find /opt/hu/m2 -name '*.lastUpdated' -delete; \
    chmod -R a+rX /opt/hu/m2 /opt/hu/spring /opt/hu/maven-user

COPY java/settings.xml /opt/maven/conf/settings.xml
COPY --from=hu-exec /hu-exec /opt/hu/bin/hu-exec
COPY shared/bin/ /opt/hu/bin/

# Mount points exist in the image and belong to learner, since a volume or
# tmpfs mounted on a missing path comes up owned by root. /workspace/target is
# where a workspace's build volume mounts (template.json build): hidden by the
# bind mount at run time, it still gives a new volume learner as its owner.
RUN mkdir -p /work /workspace/target \
 && chown -R learner:learner /work /workspace

ENV HOME=/home/learner \
    HOST=0.0.0.0 \
    LANG=C.UTF-8 \
    TZ=UTC \
    MAVEN_ARGS="-Dmaven.repo.local.tail=/opt/hu/m2" \
    MAVEN_USER_HOME=/opt/hu/maven-user

# Fail the build if a pin drifted, or if offline builds stopped working: with
# no network, a single Main.java compiles and runs against the boot profile,
# and the learner builds, tests, and runs the smallest app through the
# wrapper, from the tail alone.
RUN --network=none --mount=type=bind,source=java/bake/run,target=/tmp/run-src \
    --mount=type=bind,source=java/check,target=/tmp/profile-src \
    set -eu; \
    java -version 2>&1 | grep -q '"25\.'; \
    mvn -v | grep -q '^Apache Maven 3\.10\.0 '; \
    cd /tmp; \
    javac -parameters -proc:none --release 25 -d /tmp/out -cp '/opt/hu/spring/profiles/boot/*' /tmp/profile-src/app/Main.java; \
    java -cp '/tmp/out:/opt/hu/spring/profiles/boot/*' app.Main --spring.main.banner-mode=off --logging.level.root=WARN \
      | grep -qx hu-profile-ready; \
    rm -rf /tmp/out; \
    mkdir -p /tmp/check && cp -R /tmp/run-src /tmp/check/run && chown -R learner:learner /tmp/check; \
    runuser -u learner -- sh -c 'cd /tmp/check/run \
      && cp -R /opt/hu/maven-user/mvnw /opt/hu/maven-user/.mvn . \
      && ./mvnw -q package \
      && java -jar target/run-1.0.0.jar' | grep -qx hu-run-ready; \
    rm -rf /tmp/check /home/learner/.m2

WORKDIR /workspace
LABEL hu.versions="{\"java\":\"25\",\"maven\":\"3.10.0\",\"springBoot\":\"4.1.1\",\"postgresClient\":\"18\"}"
