import type { EditorDocumentSnapshot, EditorLayoutNode, EditorLayoutState, ModernAnimation, ModernPetDocument } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureArray<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value.slice() as T[] : fallback.slice();
}

function normalizeMovement(value: unknown, fallback?: Partial<ModernAnimation["start"]>) {
  const movement = isObject(value) ? value : {};
  return {
    x: typeof movement.x === "string" ? movement.x : fallback?.x ?? "0",
    y: typeof movement.y === "string" ? movement.y : fallback?.y ?? "0",
    interval: typeof movement.interval === "string" ? movement.interval : fallback?.interval ?? "100",
    offset_y: typeof movement.offset_y === "number" ? movement.offset_y : fallback?.offset_y ?? 0,
    opacity: typeof movement.opacity === "number" ? movement.opacity : fallback?.opacity ?? 1,
  };
}

function normalizeTransition(value: unknown) {
  const transition = isObject(value) ? value : {};
  return {
    probability: typeof transition.probability === "number" ? transition.probability : 0,
    only: typeof transition.only === "string" ? transition.only : "none",
    value: typeof transition.value === "number" ? transition.value : 0,
  };
}

function normalizeAnimation(value: unknown): ModernAnimation {
  const animation = isObject(value) ? value : {};
  const start = normalizeMovement(animation.start);
  const end = animation.end ? normalizeMovement(animation.end, start) : clone(start);
  const sequence = isObject(animation.sequence) ? animation.sequence : {};

  return {
    id: typeof animation.id === "number" ? animation.id : 0,
    name: typeof animation.name === "string" ? animation.name : "",
    start,
    end,
    sequence: {
      frames: ensureArray<number>(sequence.frames),
      nexts: ensureArray(sequence.nexts).map(normalizeTransition),
      action: typeof sequence.action === "string" ? sequence.action : undefined,
      repeat: typeof sequence.repeat === "string" ? sequence.repeat : "0",
      repeat_from: typeof sequence.repeat_from === "number" ? sequence.repeat_from : 0,
    },
    border: ensureArray(animation.border).map(normalizeTransition),
    gravity: ensureArray(animation.gravity).map(normalizeTransition),
  };
}

export function cloneDocument(document: ModernPetDocument): ModernPetDocument {
  return clone(document);
}

export function normalizeDocument(raw: unknown): ModernPetDocument {
  const root = isObject(raw) ? clone(raw) : {};
  const header = isObject(root.header) ? root.header : {};
  const image = isObject(root.image) ? root.image : {};

  return {
    ...root,
    header: {
      author: typeof header.author === "string" ? header.author : "",
      title: typeof header.title === "string" ? header.title : "",
      petname: typeof header.petname === "string" ? header.petname : "",
      version: typeof header.version === "string" ? header.version : "",
      info: typeof header.info === "string" ? header.info : "",
      application: typeof header.application === "number" ? header.application : 1,
      icon: typeof header.icon === "string" ? header.icon : "",
    },
    image: {
      tiles_x: typeof image.tiles_x === "number" ? image.tiles_x : 1,
      tiles_y: typeof image.tiles_y === "number" ? image.tiles_y : 1,
      spritesheet: typeof image.spritesheet === "string" ? image.spritesheet : "spritesheet.png",
      transparency: typeof image.transparency === "string" ? image.transparency : "",
    },
    spawns: ensureArray(root.spawns).map((spawn) => {
      const item = isObject(spawn) ? spawn : {};
      const next = isObject(item.next) ? item.next : {};
      return {
        id: typeof item.id === "number" ? item.id : 0,
        probability: typeof item.probability === "number" ? item.probability : 0,
        x: typeof item.x === "string" ? item.x : "0",
        y: typeof item.y === "string" ? item.y : "0",
        next: {
          probability: typeof next.probability === "number" ? next.probability : 0,
          only: typeof next.only === "string" ? next.only : "none",
          value: typeof next.value === "number" ? next.value : 0,
        },
      };
    }),
    animations: ensureArray(root.animations).map(normalizeAnimation),
    children: ensureArray(root.children).map((child) => {
      const item = isObject(child) ? child : {};
      const next = isObject(item.next) ? item.next : {};
      return {
        animation_id: typeof item.animation_id === "number" ? item.animation_id : 0,
        x: typeof item.x === "string" ? item.x : "0",
        y: typeof item.y === "string" ? item.y : "0",
        next: {
          probability: typeof next.probability === "number" ? next.probability : 0,
          only: typeof next.only === "string" ? next.only : "none",
          value: typeof next.value === "number" ? next.value : 0,
        },
      };
    }),
    sounds: ensureArray(root.sounds).map((sound) => {
      const item = isObject(sound) ? sound : {};
      return {
        animation_id: typeof item.animation_id === "number" ? item.animation_id : 0,
        probability: typeof item.probability === "number" ? item.probability : 0,
        loop: typeof item.loop === "number" ? item.loop : undefined,
        base64: typeof item.base64 === "string" ? item.base64 : "",
        mime_type: typeof item.mime_type === "string" ? item.mime_type : undefined,
      };
    }),
  };
}

export function serializeDocument(document: ModernPetDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function makeDefaultLayout(document: ModernPetDocument): EditorLayoutState {
  const positions: Record<string, EditorLayoutNode> = {};
  const animationCols = Math.max(1, Math.ceil(Math.sqrt(Math.max(document.animations.length, 1))));

  document.animations.forEach((animation, index) => {
    const col = index % animationCols;
    const row = Math.floor(index / animationCols);
    positions[`animation:${animation.id}`] = {
      x: 360 + col * 280,
      y: 120 + row * 210,
    };
  });

  document.spawns.forEach((spawn, index) => {
    positions[`spawn:${spawn.id}:${index}`] = {
      x: 40,
      y: 120 + index * 110,
    };
  });

  document.children?.forEach((child, index) => {
    positions[`child:${child.animation_id}:${index}`] = {
      x: 360 + animationCols * 280 + 120,
      y: 120 + index * 110,
    };
  });

  return {
    nodes: positions,
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
  };
}

export function mergeLayout(document: ModernPetDocument, layout?: Partial<EditorLayoutState> | null): EditorLayoutState {
  const base = makeDefaultLayout(document);
  if (!layout) {
    return base;
  }

  return {
    nodes: {
      ...base.nodes,
      ...(layout.nodes || {}),
    },
    viewport: {
      x: typeof layout.viewport?.x === "number" ? layout.viewport.x : base.viewport.x,
      y: typeof layout.viewport?.y === "number" ? layout.viewport.y : base.viewport.y,
      zoom: typeof layout.viewport?.zoom === "number" ? layout.viewport.zoom : base.viewport.zoom,
    },
  };
}

export function snapshotDocument(document: ModernPetDocument, layout: EditorLayoutState): EditorDocumentSnapshot {
  return {
    document: cloneDocument(document),
    layout: clone(layout),
  };
}
