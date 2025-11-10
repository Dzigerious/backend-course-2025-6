const express = require("express");
const app = express();
const fs = require('fs');
const { access, mkdir } = require('fs/promises');
const { constants } = require('fs');
const { program } = require('commander');

program
  .requiredOption('-h, --host <host>', 'Server host')
  .requiredOption('-p, --port <port>', 'Server port')
  .requiredOption('-c, --cache <path>', 'Cache directory');

program.parse();
const options = program.opts();

const host = options.host;
const port = options.port;
const cache = options.cache;

const ensureCacheDir = async (dirPath) => {
  try {
    await access(dirPath, constants.F_OK);
    console.log("Cache dir already exists");
  } catch {
    await mkdir(dirPath, { recursive: true });
    console.log("Created new cache dir");
  }
};

ensureCacheDir(cache);

app.get('/', (req, res) => {
  res.send("server is working");
});

app.listen(port, host, () => {
  console.log(`server is working on http://${host}:${port}`);
});
