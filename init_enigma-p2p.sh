#!/bin/bash

set -xe

if [[ -f "/tmp/enigma-p2p/test/ethereum/scripts/build/contracts/Enigma.json" ]]; then
    exit
fi

rm -rf /tmp/enigma-p2p
git clone -b libp2p-encryption --single-branch https://github.com/enigmampc/enigma-p2p.git /tmp/enigma-p2p
cd /tmp/enigma-p2p
npm install

npm install truffle
cd test/ethereum/scripts
rm -rf build
npx truffle compile