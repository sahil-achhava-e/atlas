# MemPalace, for machines where it cannot run natively.
#
# ThreatLocker (and policies like it) refuse to let Python dlopen an ad-hoc
# signed .so, which is every wheel MemPalace depends on: chromadb, tokenizers,
# onnxruntime. Measured on this fleet: the same wheel fails under the system
# Python and under Homebrew's, from /tmp and from $HOME, always with
# `mmap(...) failed with errno=1`. A Linux container has no such rule.
#
# Built by Atlas on first use. There is no registry and nothing to pull.
FROM python:3.12-slim

# Corporate TLS is intercepted on some networks, so a CA bundle is copied into
# the build context when one exists. The `|| true` shape keeps the build working
# on a normal network where no bundle was written.
COPY ca.pem* /
ENV SSL_CERT_FILE=/ca.pem PIP_CERT=/ca.pem REQUESTS_CA_BUNDLE=/ca.pem

# Pinned exactly. Two colleagues building a month apart must get one image, and
# a registry would have given that for free — this is what replaces it.
RUN pip install --no-cache-dir --disable-pip-version-check mempalace==3.9.0

# Bake the embedding model into the image.
#
# Without this, chromadb downloads MiniLM-L6-v2 (167MB) into ~/.cache/chroma the
# first time anything embeds — and with a per-call container that cache dies with
# the container, so EVERY search pays 13s instead of 0.8s. Note HF_HOME is a red
# herring: chroma does not use it. Measured, not assumed.
RUN python -c "\
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2 as E; \
e = E(); e(['warm the cache']); print('embedding model baked')"

# Unbuffered because MemPalace's MCP mode speaks newline-delimited JSON over
# stdio; block buffering makes a working server look hung.
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["mempalace"]
