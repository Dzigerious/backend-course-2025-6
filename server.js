const express = require("express");
const app = express();
const fs = require('fs');
const { constants } = require('fs');
const { program } = require('commander');
const { v4: uuidv4, validate: uuidValidate, version: uuidVersion } = require("uuid");
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
    await fsp.access(dirPath, constants.F_OK);
    console.log("Cache dir already exists");
  } catch {
    await fsp.mkdir(dirPath, { recursive: true });
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, cacheDir);
  }, 
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, uuidv4() + ext);
  }
})

const upload = multer({ storage });

async function readInventory() {
  try {
    try {
      await fsp.access(inventoryFile, fs.constants.F_OK); //F_OK - checks that file are idk, created
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

function isUuidV4(id) {
  return uuidValidate(id) && uuidVersion(id) === 4;
}

app.use(express.static(__dirname + `/public`));
app.use('/cache', express.static(cacheDir));

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
  const photoPath = req.file ? `http://${host}:${port}/cache/${req.file.filename}` : null;

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

app.get('/inventory', async (req, res) => {
  try{
    const inventory = await readInventory();
    res.status(200).json(inventory)
  } catch (err) {
    console.error('Err');
    res.status(500).send('Failed to load JSON');
  }
})

app.get('/inventory/:id', async (req, res) => {
    const { id } = req.params;
    
    if (!isUuidV4(id)) {
      return res.status(400).json({ message: "Ivalid id format(bad Request)" });
    }

    try {
      const items = await readInventory();
      const item = items.find(i => i.id === id);

      if(!item) { //valid uuid but didnt find the exact element
        return res.status(404).json({ message: 'Ited not found (404)' })
      }

      return res.json(item);
    } catch (err) {
      console.error("Error in get /item/:id");
      return res.status(500).send('Internal server Error');
    }
});

app.listen(port, host, () => {
  console.log(`server is working on http://${host}:${port}`);
});
