# syntax=docker/dockerfile:1
# A release image for the API, in two stages: build the binary with the full Go
# toolchain, then copy only the binary into a minimal image that has no shell and runs
# as a non-root user. Hack University cannot run Docker inside a workspace, so lesson 42
# reads this file instead of building it.

FROM golang:1.27.2-trixie AS build
WORKDIR /src
# Dependencies first, so this layer is cached until go.mod or go.sum change.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/api /api
ENV PORT=8080 MIGRATE_ON_START=true APP_ENV=production
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/api"]
