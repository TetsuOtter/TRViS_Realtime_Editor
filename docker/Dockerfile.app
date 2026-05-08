FROM rust:1.87-slim AS builder

WORKDIR /build

# Use a docker-specific workspace manifest that excludes src-tauri
COPY docker/Cargo.docker.toml ./Cargo.toml
COPY Cargo.lock ./
COPY crates/ ./crates/

RUN cargo build --release -p trvis-ws-server-bin

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/trvis-ws-server /usr/local/bin/trvis-ws-server

EXPOSE 23519 23520

ENTRYPOINT ["trvis-ws-server"]
CMD ["--host", "0.0.0.0", "--port", "23519", "--cmd-port", "23520", "--sync-interval-ms", "0"]
