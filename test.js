const { spawn } = require("child_process");
const exec = require("util").promisify(require("child_process").exec);
const fs = require("fs");
const assert = require("assert");

let truffleDevelopProcess;
let account;

before(async function() {
  this.timeout(120000);

  if (!fs.existsSync("/tmp/enigma-p2p/test/ethereum/scripts/build/contracts/Enigma.json")) {
    await exec(`rm -rf /tmp/enigma-p2p`);
    await exec(`git clone -b develop --single-branch https://github.com/enigmampc/enigma-p2p.git /tmp/enigma-p2p`);
    await exec(`npm install`, { cwd: "/tmp/enigma-p2p" });
    await exec(`npm install truffle`, { cwd: "/tmp/enigma-p2p" });
    await exec(`rm -rf build && npx truffle compile`, { cwd: "/tmp/enigma-p2p/test/ethereum/scripts" });
  }

  truffleDevelopProcess = spawn("npx", ["truffle", "develop"], { cwd: "/tmp/enigma-p2p/test/ethereum/scripts" });
  return new Promise(async resolve => {
    truffleDevelopProcess.stdout.on("data", async data => {
      data = data.toString().match(/\(0\) 0x[a-f0-9]+/);
      if (Array.isArray(data) && data.length === 1) {
        account = data[0].split(" ")[1];
        assert(account.length > 0);
        resolve();
      }
    });
  });
});

after(async () => {
  await exec(`kill -KILL ${truffleDevelopProcess.pid}`);
});

let enigmaContractAddress;
beforeEach(async function() {
  this.timeout(60000);

  enigmaContractAddress = (
    await exec(`npx truffle migrate --reset`, { cwd: "/tmp/enigma-p2p/test/ethereum/scripts" })
  ).stdout
    .trim()
    .match(/contract address:\s+0x[a-fA-f0-9]+/g)
    .slice(-1)[0]
    .split(/\s/)
    .slice(-1)[0];

  assert(enigmaContractAddress.length > 0);
});

let killList = [];
beforeEach(async () => {
  killList = [];
});

afterEach(async () => {
  for (const process of killList) {
    try {
      await exec(`kill -KILL ${process.pid}`);
    } catch (e) {}
  }
  killList = [];
});

it("subscribe to /broadcast/0.1 and /taskresult/0.1", function() {
  this.timeout(60000);

  const monitor = spawn("node", [
    "main.js",
    "--bootstrap",
    "/ip4/127.0.0.1/tcp/10300/ipfs/QmcrQZ6RJdpYuGvZqD5QEHAv6qX4BrQLJLQPQUrTrzdcgm",
    "--enigma-contract-json-path",
    "/tmp/enigma-p2p/test/ethereum/scripts/build/contracts/Enigma.json",
    "--enigma-contract-address",
    enigmaContractAddress
  ]);
  killList.push(monitor);

  return new Promise(resolve => {
    let broadcast = false;
    let taskresults = false;
    monitor.stderr.on("data", async data => {
      data = data.toString();
      if (data.includes("subscribe\t/broadcast/0.1")) {
        broadcast = true;
      }
      if (data.includes("subscribe\t/taskresults/0.1")) {
        taskresults = true;
      }
      if (taskresults && broadcast) {
        resolve();
      }
    });
  });
}, 60000);

describe("start after bootstrap", function() {
  this.timeout(60000);

  it("connect to bootstrap", function() {
    const bootstrap = spawn(
      "node",
      [
        "src/cli/cli_app.js",
        "-i",
        "B1",
        "-p",
        "B1",
        "--auto-init",
        "--mock-core",
        "--core",
        "127.0.0.1:3456",
        "--ethereum-address",
        account,
        "--ethereum-contract-address",
        enigmaContractAddress
      ],
      { cwd: "/tmp/enigma-p2p" }
    );
    killList.push(bootstrap);

    const monitor = spawn("node", [
      "main.js",
      "--bootstrap",
      "/ip4/127.0.0.1/tcp/10300/ipfs/QmcrQZ6RJdpYuGvZqD5QEHAv6qX4BrQLJLQPQUrTrzdcgm",
      "--enigma-contract-json-path",
      "/tmp/enigma-p2p/test/ethereum/scripts/build/contracts/Enigma.json",
      "--enigma-contract-address",
      enigmaContractAddress
    ]);
    killList.push(monitor);

    return new Promise(resolve => {
      monitor.stderr.on("data", async data => {
        data = data.toString();
        if (data.includes("peer:connect\tQmcrQZ6RJdpYuGvZqD5QEHAv6qX4BrQLJLQPQUrTrzdcgm")) {
          resolve();
        }
      });
    });
  });

  it("subscribe to worker topic", function() {
    const bootstrap = spawn(
      "node",
      [
        "src/cli/cli_app.js",
        "-i",
        "B1",
        "-p",
        "B1",
        "--auto-init",
        "--lonely-node",
        "--mock-core",
        "--core",
        "127.0.0.1:3456",
        "--ethereum-address",
        account,
        "--ethereum-contract-address",
        enigmaContractAddress
      ],
      { cwd: "/tmp/enigma-p2p" }
    );
    killList.push(bootstrap);

    const monitor = spawn("node", [
      "main.js",
      "--bootstrap",
      "/ip4/127.0.0.1/tcp/10300/ipfs/QmcrQZ6RJdpYuGvZqD5QEHAv6qX4BrQLJLQPQUrTrzdcgm",
      "--enigma-contract-json-path",
      "/tmp/enigma-p2p/test/ethereum/scripts/build/contracts/Enigma.json",
      "--enigma-contract-address",
      enigmaContractAddress
    ]);
    killList.push(monitor);

    return new Promise(resolve => {
      monitor.stderr.on("data", async data => {
        data = data.toString();
        if (/subscribe\t[a-f0-9]{40}\b/.test(data)) {
          resolve();
        }
      });
    });
  });
});

describe("start before bootstrap", function() {
  this.timeout(60000);

  it("connect to bootstrap", function() {
    const monitor = spawn("node", [
      "main.js",
      "--bootstrap",
      "/ip4/127.0.0.1/tcp/10300/ipfs/QmcrQZ6RJdpYuGvZqD5QEHAv6qX4BrQLJLQPQUrTrzdcgm",
      "--enigma-contract-json-path",
      "/tmp/enigma-p2p/test/ethereum/scripts/build/contracts/Enigma.json",
      "--enigma-contract-address",
      enigmaContractAddress
    ]);
    killList.push(monitor);

    const bootstrap = spawn(
      "node",
      [
        "src/cli/cli_app.js",
        "-i",
        "B1",
        "-p",
        "B1",
        "--auto-init",
        "--mock-core",
        "--core",
        "127.0.0.1:3456",
        "--ethereum-address",
        account,
        "--ethereum-contract-address",
        enigmaContractAddress
      ],
      { cwd: "/tmp/enigma-p2p" }
    );
    killList.push(bootstrap);

    return new Promise(resolve => {
      monitor.stderr.on("data", async data => {
        data = data.toString();
        if (data.includes("peer:connect\tQmcrQZ6RJdpYuGvZqD5QEHAv6qX4BrQLJLQPQUrTrzdcgm")) {
          resolve();
        }
      });
    });
  });

  it("subscribe to worker topic", function() {
    const monitor = spawn("node", [
      "main.js",
      "--bootstrap",
      "/ip4/127.0.0.1/tcp/10300/ipfs/QmcrQZ6RJdpYuGvZqD5QEHAv6qX4BrQLJLQPQUrTrzdcgm",
      "--enigma-contract-json-path",
      "/tmp/enigma-p2p/test/ethereum/scripts/build/contracts/Enigma.json",
      "--enigma-contract-address",
      enigmaContractAddress
    ]);
    killList.push(monitor);

    const bootstrap = spawn(
      "node",
      [
        "src/cli/cli_app.js",
        "-i",
        "B1",
        "-p",
        "B1",
        "--auto-init",
        "--lonely-node",
        "--mock-core",
        "--core",
        "127.0.0.1:3456",
        "--ethereum-address",
        account,
        "--ethereum-contract-address",
        enigmaContractAddress
      ],
      { cwd: "/tmp/enigma-p2p" }
    );
    killList.push(bootstrap);

    return new Promise(resolve => {
      monitor.stderr.on("data", async data => {
        data = data.toString();
        if (/subscribe\t[a-f0-9]{40}\b/.test(data)) {
          resolve();
        }
      });
    });
  });
});
