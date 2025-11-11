const express = require("express");
const app = express();
const fs = require('fs');
const { access, mkdir } = require('fs/promises');
const { constants } = require('fs');
const { program } = require('commander');
const { v4: uuidv4 } = require("uuid");
const path = require('path');
const multer = require('multer');
const fsp = require('fs/promises');

program
  .requiredOption('-h, --host <host>', 'Server host')
  .requiredOption('-p, --port <port>', 'Server port')
  .requiredOption('-c, --cache <path>', 'Cache directory');

program.parse();
const options = program.opts();

const host = options.host;
const port = options.port;
const cache = options.cache;

const cacheDir = path.join(__dirname, cache);
const inventoryFile = path.join(cacheDir, 'inventory.json');

const ensureCacheDir = async (dirPath) => {
  try {
    await access(dirPath, constants.F_OK);
    console.log("Cache dir already exists");
  } catch {
    await mkdir(dirPath, { recursive: true });
    console.log("Created new cache dir");
  }
};

async function ensureInventoryFile() { //could just insert inside readInventory function
  try {
    await fsp.access(inventoryFile, fs.constants.F_OK);
    console.log("Inventory.json already exists");
  } catch {
    await fsp.writeFile(inventoryFile, '[]', "utf8");
    console.log('Created new file inventory.json');
  }
}

ensureCacheDir(cacheDir);
ensureInventoryFile();

const upload = multer({ dest: cacheDir });

async function readInventory() {
  try {
    try {
      await fsp.access(inventoryFile, fs.constants.F_OK);
    } catch {
      return [];
    }

    const content = await fsp.readFile(inventoryFile, 'utf-8');

    if (!content.trim()) {
      return [];
    }

    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Error reading inventory", err);
    return [];
  }
}

async function saveInventory(items) {
  try {
    await fsp.writeFile(inventoryFile, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing inventory: ', err);
    throw err;
  }
}

const readJSON = function (filePath) {
  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      console.error('Erro of reading JSON file', err);
      return;
    }

    try {
      const jsonData = JSON.parse(data);
      console.log("Json File: ", jsonData);
    } catch (err) {
      console.error('Failed parsing JSON', err);
    }
  });
};

app.use(express.static(__dirname + `/public`));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send("server is working");
});

app.post('/register', upload.single('photo'), async (req, res) => {
  const { inventory_name, description } = req.body;

  if (!inventory_name) {
    return res.status(400).send('Inventory name is required');
  }

  const id = uuidv4();
  const photoPath = req.file ? req.file.filename : null;

  const newItem = {
    id: id,
    name: inventory_name,
    description: description || "",
    photo: photoPath
  };

  try {
    const items = await readInventory();
    items.push(newItem);
    await saveInventory(items);

    return res.status(201).json({
      message: 'Item created',
      item: newItem
    });
  } catch (err) {
    console.error('Error in /register:', err);
    return res.status(500).send('Internal Server Error');
  }
});

app.listen(port, host, () => {
  console.log(`server is working on http://${host}:${port}`);
});
