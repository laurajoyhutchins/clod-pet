export const modernPetSchema = {
  type: "object",
  required: ["header", "image", "spawns", "animations"],
  additionalProperties: true,
  properties: {
    header: {
      type: "object",
      additionalProperties: true,
      properties: {
        author: { type: "string" },
        title: { type: "string" },
        petname: { type: "string" },
        version: { type: "string" },
        info: { type: "string" },
        application: { type: "number" },
        icon: { type: "string" },
      },
    },
    image: {
      type: "object",
      required: ["tiles_x", "tiles_y", "spritesheet"],
      additionalProperties: true,
      properties: {
        tiles_x: { type: "integer", minimum: 1 },
        tiles_y: { type: "integer", minimum: 1 },
        spritesheet: { type: "string", minLength: 1 },
        transparency: { type: "string" },
      },
    },
    spawns: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "probability", "x", "y", "next"],
        additionalProperties: true,
        properties: {
          id: { type: "integer", minimum: 1 },
          probability: { type: "integer", minimum: 0 },
          x: { type: "string" },
          y: { type: "string" },
          next: { $ref: "#/$defs/transition" },
        },
      },
    },
    animations: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "start", "sequence"],
        additionalProperties: true,
        properties: {
          id: { type: "integer", minimum: 1 },
          name: { type: "string" },
          start: { $ref: "#/$defs/movement" },
          end: { $ref: "#/$defs/movement" },
          sequence: {
            type: "object",
            required: ["frames", "repeat", "repeat_from"],
            additionalProperties: true,
            properties: {
              frames: {
                type: "array",
                items: { type: "integer", minimum: 0 },
              },
              nexts: {
                type: "array",
                items: { $ref: "#/$defs/transition" },
              },
              action: { type: "string" },
              repeat: { type: "string" },
              repeat_from: { type: "integer", minimum: 0 },
            },
          },
          border: {
            type: "array",
            items: { $ref: "#/$defs/transition" },
          },
          gravity: {
            type: "array",
            items: { $ref: "#/$defs/transition" },
          },
        },
      },
    },
    children: {
      type: "array",
      items: {
        type: "object",
        required: ["animation_id", "x", "y", "next"],
        additionalProperties: true,
        properties: {
          animation_id: { type: "integer", minimum: 1 },
          x: { type: "string" },
          y: { type: "string" },
          next: { $ref: "#/$defs/transition" },
        },
      },
    },
    sounds: {
      type: "array",
      items: {
        type: "object",
        required: ["animation_id", "probability", "base64"],
        additionalProperties: true,
        properties: {
          animation_id: { type: "integer", minimum: 1 },
          probability: { type: "integer", minimum: 0 },
          loop: { type: "number" },
          base64: { type: "string" },
          mime_type: { type: "string" },
        },
      },
    },
  },
  $defs: {
    movement: {
      type: "object",
      required: ["x", "y", "interval"],
      additionalProperties: true,
      properties: {
        x: { type: "string" },
        y: { type: "string" },
        interval: { type: "string" },
        offset_y: { type: "number" },
        opacity: { type: "number" },
      },
    },
    transition: {
      type: "object",
      required: ["probability", "value"],
      additionalProperties: true,
      properties: {
        probability: { type: "integer", minimum: 0 },
        only: { type: "string" },
        value: { type: "integer", minimum: 1 },
      },
    },
  },
} as const;
