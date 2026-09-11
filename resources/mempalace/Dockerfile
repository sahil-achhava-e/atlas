# MemPalace, for machines where it cannot run natively.
#
# ThreatLocker (and policies like it) refuse to let Python dlopen an ad-hoc
# signed .so, which is every wheel MemPalace depends on: chromadb, tokenizers,
# onnxruntime. Measured: the same wheel fails under the system Python and under
# Homebrew's, from /tmp and from $HOME, always `mmap(...) failed with errno=1`,
# while a NODE addon of the same signature loads fine from the same directory.
# The rule follows the loading process, so no reinstall or relocation helps.
# A Linux container has none of it.
#
# Built by Atlas on first use. There is no registry and nothing to pull.
FROM python:3.12-slim

# A corporate CA, only on networks that intercept TLS. The wildcard copies it
# when Atlas found one and copies nothing when it did not: a colleague on a
# normal network must still be able to build this.
#
# It is read inside the RUN rather than set as ENV. An unconditional
# `ENV PIP_CERT=/ca.pem` pointed pip at a file that was not there on every
# machine but the one this was written on, and pip refuses to start:
# "Could not find a suitable TLS CA certificate bundle, invalid path".
COPY ca.pem* /tmp/ca/

# Pinned exactly. Two colleagues building a month apart must get one image, and
# a registry would have given that for free — this is what replaces it.
#
# The embedding model is baked in the same layer. Without it chromadb downloads
# MiniLM-L6-V2 (167MB) into ~/.cache/chroma the first time anything embeds, and
# with a per-call container that cache dies with the container, so EVERY search
# costs 13s instead of 0.8s. HF_HOME is a red herring: chroma does not use it.
RUN set -eu; \
    if [ -f /tmp/ca/ca.pem ]; then \
      export PIP_CERT=/tmp/ca/ca.pem SSL_CERT_FILE=/tmp/ca/ca.pem REQUESTS_CA_BUNDLE=/tmp/ca/ca.pem; \
      cp /tmp/ca/ca.pem /usr/local/share/ca-certificates/corp.crt 2>/dev/null || true; \
    fi; \
    pip install --no-cache-dir --disable-pip-version-check mempalace==3.9.0; \
    python -c "from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2 as E; e = E(); e(['warm the cache']); print('embedding model baked')"

# Unbuffered because MemPalace's MCP mode speaks newline-delimited JSON over
# stdio; block buffering makes a working server look hung. Nothing is fetched at
# runtime, so no TLS settings are needed past the build.
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["mempalace"]
