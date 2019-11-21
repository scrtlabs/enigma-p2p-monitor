#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const LibP2pBundle = require(path.join(__dirname, "libp2p-bundle.js"));
const PeerInfo = require("peer-info");
const { promisify } = require("util");
const flags = require("flags");
const Web3 = require("web3");
const { ProviderResolver } = require("web3-providers");

const socketProviderAdapter = new ProviderResolver().resolve("ws://localhost:8546");

// TODO: By default get enigmaContractAddress from an official source
// TODO: By default get enigmaContractABI from an official source
// TODO: Maybe use infura.io free tier as the default web3 provider?
flags.defineStringList("bootstrap", [], "Comma separated list of bootstrap nodes libp2p multiaddr.");
flags.defineString("enigma-contract-address", null, "Ethereum address of the Enigma smart contract.");
flags.defineString("enigma-contract-json-path", null, "Path to the compiled JSON file of the Enigma smart contract.");
flags.defineString("web3-provider", "ws://localhost:9545", "URL of the web3 provider.");

flags.parse();

const web3 = new Web3(new ProviderResolver().resolve(flags.get("web3-provider")));

const enigmaContractAddress = flags.get("enigma-contract-address");
const enigmaContractABI = JSON.parse(fs.readFileSync(flags.get("enigma-contract-json-path"), "utf8")).abi;
const enigmaContract = new web3.eth.Contract(enigmaContractABI, enigmaContractAddress);

const boostrapNodes = flags.get("bootstrap");
for (const node of boostrapNodes) {
  console.error("boostrap_node\t" + node);
}

if (boostrapNodes.length === 0) {
  console.error("Must enter at least one bootstrap node. Exiting.");
  process.exit(1);
}

(async () => {
  const PeerInfoCreate = promisify(PeerInfo.create).bind(PeerInfo);
  const peerInfo = await PeerInfoCreate(); // No need to try/catch. Let it throw.
  peerInfo.multiaddrs.add("/ip4/0.0.0.0/tcp/0");

  const node = new LibP2pBundle({
    peerInfo,
    config: {
      peerDiscovery: {
        bootstrap: {
          list: boostrapNodes
        }
      }
    }
  });

  const nodeStart = promisify(node.start).bind(node);
  await nodeStart(); // No need to try/catch. Let it throw.

  console.error(`my_libp2p_id\t${node.peerInfo.id.toB58String()}`);

  for (const multiaddr of node.peerInfo.multiaddrs.toArray()) {
    console.error(`my_multiaddr\t${multiaddr.toString()}`);
  }

  const nodeDial = promisify(node.dial).bind(node);
  node.on("peer:discovery", async peerInfo => {
    try {
      await nodeDial(peerInfo);
    } catch (e) {
      // Discovered a peer but couldn't connect.
      // Will try again in ${peerDiscovery.bootstrap.interval}ms time
    }
  });

  node.on("peer:connect", peerInfo => {
    console.error("peer:connect\t" + peerInfo.id.toB58String());
  });

  node.on("peer:disconnect", peerInfo => {
    console.error("peer:disconnect\t" + peerInfo.id.toB58String());
  });

  const topics = ["/taskresults/0.1", "/broadcast/0.1"];

  for (const topic of topics) {
    node.pubsub.subscribe(
      topic,
      msg => {
        console.log(
          JSON.stringify({
            date: new Date().toJSON(),
            libp2p_sender: msg.from,
            msg: JSON.parse(msg.data.toString())
          })
        );
      },
      () => {}
    );
  }

  // setInterval(async () => {
  //   const x = await promisify(node.pubsub.peers)("/broadcast/0.1");
  //   // This only gets from neighbors
  //   // Need to find a way to get from evry node

  //   console.log(new Date().toJSON(), x.length);
  // }, 1000);
})();
