const express = require("express");
const app = express();
const fs = require('fs');
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
    await fsp.access(dirPath, fs.constants.F_OK);
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

app.put('/inventory/:id', async (req, res) => {
  const { id } = req.params;
    
  if (!isUuidV4(id)) {
    return res.status(400).json({ message: "Ivalid id format(bad Request)" });
  }
  try {
    const items = await readInventory();

    const index = items.findIndex(item => item.id === id);
    if (index === -1) {
      return res.status(404).json({message: "Item not found (404)"});
    }

    const { name, description } = req.body;

    if(!name && !description) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    if (name) {
      items[index].name = name;
    }

    if (description) {
      items[index].description = description;
    }

    await saveInventory(items);

    return res.status(200).json({Message: "Item updated", item: items[index]})
  } catch (err) {
    console.error('Error in updating Name or description')
    res.status(500).send('Server Error')
  } 
}) 

app.get('/inventory/:id/photo', async (req, res) => {
    const { id } = req.params;
    
    if (!isUuidV4(id)) {
      return res.status(400).json({ message: "Ivalid id format(bad Request)" });
    }

    try{
      const items = await readInventory();
      const item = items.find(i => i.id === id);

      if(!item || !item.photo) {
        return res.status(404).json({ message: "Photo not found(404)" })
      }

      const filename = path.basename(item.photo);
      const filePath = path.join(cacheDir, filename);
      
      return res.sendFile(filePath);
    } catch (err){
      console.error("Error in GET /inventory/:id/photo", err);
      return res.status(500).send('Server Error');
    }
})

app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  const { id } = req.params;
    
  if (!isUuidV4(id)) {
    return res.status(400).json({ message: "Ivalid id format(bad Request)" });
  } try{
    const items = await readInventory();
    const index = items.findIndex(item => item.id === id);

    if(index === -1){
      return res.status(404).json({ message: "not Found (404)" });
    }

    if (!req.file) {
      return res.status(400).json({message: 'Photo file is required'});
    }

    const oldPhotoUrl = items[index].photo
    if (oldPhotoUrl) {
      const oldFilename = path.basename(oldPhotoUrl);
      const oldFilePath = path.join(cacheDir, oldFilename);

      try {
        await fsp.unlink(oldFilePath)
      } catch (err) {
        console.error("Cannot delete old photo: ", err.message);
      }
    }

    const newPhotoUrl = `http://${host}:${port}/cache/${req.file.filename}`;
    items[index].photo = newPhotoUrl;

    await saveInventory(items);

    return res.status(200).json({ message: 'Photo updated' });
    
  } catch (err){
    console.error("error in updating photo", err);
    return res.status(500).send("Error in put(photo)");
  }
})

app.delete('/inventory/:id', async (req, res) => {
  const { id } = req.params;

  if (!isUuidV4(id)) {
    return res.status(400).json({ message: "Ivalid id format(bad Request)" });
  }

  try {
    const items = await readInventory();

    const index = items.findIndex(item => item.id === id);
    if (index === -1){
      console.error('Error 404 not found item to delete')
      return res.status(404).json({message: 'Error 404, not found'});
    }

    const itemToDelete = items[index];
    
    if (itemToDelete.photo) {
      const filename = path.basename(itemToDelete.photo);
      const filePath = path.join(cacheDir, filename);
      
      try {
        await fsp.unlink(filePath);
        console.log(`Photo file was deleted ${filePath}`);
      } catch (err) {
        console.error('Cannot delete photofile: ', err.message);
      }
    }  
    items.splice(index, 1);

    await saveInventory(items);
    return res.status(200).json({Message: `Item deleted`, deletedItem: itemToDelete}); 
  } catch (err){
    console.error('Error in delete /inventory/:id', err);
    return res.status(500).send('Internal Server Error');
  }
})

app.post('/search', async (req, res) => {
  const { id, has_photo } = req.body;

  if (!id) {
    return res.status(400).json({message: "Fiel 'id' is required(400)"});
  }

  if (!isUuidV4(id)) {
    return res.status(400).json({ message: "Invalid id format (Bad Request)" });
  }

  try {
    const items = await readInventory();

    const item = items.find(i => i.id === id);
    if (!item) {
      return res.status(404).json({message: 'Item not found(404)'});
    }

    const result = {...item}; // with spread operator i create a new value
 
    if (has_photo && item.photo) {
      const photoText = `Photo: ${item.photo}`;
      if (result.description) {
        result.description += photoText;
      } else {
        result.description = photoText.trim();
      }
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in POST /search: ", err);
    return res.status(500).send("Internal Server ERROR");
  }
})

  

app.listen(port, host, () => {
  console.log(`server is working on http://${host}:${port}`);
});
