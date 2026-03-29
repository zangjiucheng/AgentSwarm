#!/usr/bin/env bash

set -euo pipefail

apt-get update
apt-get install -y --no-install-recommends \
  firefox-esr \
  imagemagick \
  tesseract-ocr \
  xclip
rm -rf /var/lib/apt/lists/*
