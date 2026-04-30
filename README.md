# Clod Pet

A desktop pet application. Go backend handles animation logic; Electron frontend renders transparent sprite windows.

## Documentation (Diataxis)

|                | **Tutorials** (learning) | **How-to guides** (goals) | **Reference** (information) | **Explanation** (understanding) |
|----------------|--------------------------|---------------------------|-----------------------------|----------------------------------|
| **Purpose**    | Get started              | Solve real problems       | Look up facts               | Understand concepts             |
| **Where**      | [tutorials/](docs/tutorials/) | [howto/](docs/howto/)   | [reference/](docs/reference/) | [explanation/](docs/explanation/) |

### Quick start

```bash
cd frontend && npm install && npm start
```

### Project structure

```
clod-pet/
├── backend/                  # Go animation engine
│   ├── main.go               # HTTP server + API routes
│   └── internal/
│       ├── pet/              # XML parser (animations.xml)
│       ├── engine/           # Animation state machine
│       ├── expression/       # Expression evaluator (screenW, random, etc.)
│       ├── ipc/              # HTTP JSON protocol types & handlers
│       ├── settings/         # JSON config persistence
│       └── sound/            # Audio playback
├── frontend/                 # Electron desktop shell
│   ├── main.js               # Spawns Go backend, manages pet windows
│   ├── pet.html              # Transparent pet window template
│   └── src/
│       ├── preload.js        # Context bridge (ipcRenderer)
│       └── pet-renderer.js   # Canvas sprite sheet renderer
├── pets/                     # Pet data directories
│   └── esheep64/
│       └── animations.xml    # Sprite sheet + animation definitions
└── docs/                     # This documentation
```
