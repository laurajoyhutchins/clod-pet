import Ajv from "ajv";
import { modernPetSchema } from "./schema";
import type { ErrorObject } from "ajv";
import type { EditorPreviewState, ModernPetDocument, ValidationIssue } from "./types";

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function isPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function pushIssue(target: ValidationIssue[], severity: "error" | "warning", path: string, message: string, entityKey?: string) {
  target.push({ severity, path, message, entityKey });
}

function makeIssueBuckets() {
  return { errors: [] as ValidationIssue[], warnings: [] as ValidationIssue[] };
}

const ajv = new Ajv({ allErrors: true, strict: false });
let validateModernPetSchema: (((data: ModernPetDocument) => boolean) & { errors?: ErrorObject[] | null }) | null = null;
let schemaValidationDisabled = false;

function getSchemaValidator() {
  if (validateModernPetSchema || schemaValidationDisabled) {
    return validateModernPetSchema;
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    schemaValidationDisabled = true;
    return null;
  }

  try {
    validateModernPetSchema = ajv.compile(modernPetSchema) as ((data: ModernPetDocument) => boolean) & { errors?: ErrorObject[] | null };
  } catch (err) {
    schemaValidationDisabled = true;
    validateModernPetSchema = null;
  }

  return validateModernPetSchema;
}

function formatAjvPath(error: ErrorObject) {
  return error.instancePath
    .replace(/^\//, "")
    .replace(/\//g, ".")
    .replace(/\.(\d+)(?=\.|$)/g, "[$1]");
}

function formatAjvMessage(error: ErrorObject) {
  if (error.keyword === "required") {
    const missing = (error.params as { missingProperty?: string }).missingProperty;
    return missing ? `${missing} is required` : "required field is missing";
  }
  return error.message || "schema validation failed";
}

function validateTransitionGroup(
  issues: ValidationResult,
  transitions: { probability: number; value: number; only?: string }[] | undefined,
  path: string,
  entityKey: string,
  animationIds: Set<number>,
) {
  if (!transitions || transitions.length === 0) return;

  let allZero = true;
  for (let index = 0; index < transitions.length; index++) {
    const transition = transitions[index];
    const itemPath = `${path}[${index}]`;
    if (!isNonNegativeInteger(transition.probability)) {
      pushIssue(issues.errors, "error", `${itemPath}.probability`, "probability must be a non-negative integer", entityKey);
    }
    if (!Number.isInteger(transition.value) || transition.value <= 0) {
      pushIssue(issues.errors, "error", `${itemPath}.value`, "target animation id must be a positive integer", entityKey);
    } else if (!animationIds.has(transition.value)) {
      pushIssue(issues.errors, "error", `${itemPath}.value`, `target animation ${transition.value} does not exist`, entityKey);
    }
    if (transition.probability > 0) {
      allZero = false;
    }
  }

  if (allZero) {
    pushIssue(issues.warnings, "warning", path, "all transition probabilities in this group are 0", entityKey);
  }
}

export function validateDocumentStructure(
  document: ModernPetDocument,
  previews: EditorPreviewState,
): ValidationResult {
  const issues = makeIssueBuckets();

  if (!document || typeof document !== "object") {
    pushIssue(issues.errors, "error", "", "document is not an object");
    return issues;
  }

  const schemaValidator = getSchemaValidator();
  if (schemaValidator && !schemaValidator(document)) {
    for (const error of schemaValidator.errors || []) {
      pushIssue(issues.errors, "error", formatAjvPath(error), formatAjvMessage(error));
    }
  }

  if (!document.header || typeof document.header !== "object") {
    pushIssue(issues.errors, "error", "header", "header is required");
  }
  if (!document.image || typeof document.image !== "object") {
    pushIssue(issues.errors, "error", "image", "image is required");
  }
  if (!Array.isArray(document.spawns)) {
    pushIssue(issues.errors, "error", "spawns", "spawns must be an array");
  }
  if (!Array.isArray(document.animations)) {
    pushIssue(issues.errors, "error", "animations", "animations must be an array");
  }

  const header = document.header || {};
  const image = document.image || {};

  if (!isPositiveInteger(image.tiles_x)) {
    pushIssue(issues.errors, "error", "image.tiles_x", "tiles_x must be a positive integer");
  }
  if (!isPositiveInteger(image.tiles_y)) {
    pushIssue(issues.errors, "error", "image.tiles_y", "tiles_y must be a positive integer");
  }
  if (typeof image.spritesheet !== "string" || image.spritesheet.trim() === "") {
    pushIssue(issues.errors, "error", "image.spritesheet", "spritesheet is required");
  }

  if (typeof header.icon === "string" && header.icon && previews.iconError) {
    pushIssue(issues.errors, "error", "header.icon", previews.iconError);
  }
  if (previews.spritesheetError) {
    pushIssue(issues.errors, "error", "image.spritesheet", previews.spritesheetError);
  }

  const animationIds = new Set<number>();
  const duplicateIds = new Set<number>();

  (document.animations || []).forEach((animation, index) => {
    if (!Number.isInteger(animation.id) || animation.id <= 0) {
      pushIssue(issues.errors, "error", `animations[${index}].id`, "animation id must be a positive integer", `animation:${animation.id}`);
    }
    if (animationIds.has(animation.id)) {
      duplicateIds.add(animation.id);
    }
    animationIds.add(animation.id);
  });

  (document.animations || []).forEach((animation, index) => {
    const key = `animation:${animation.id}`;
    if (typeof animation.name !== "string" || animation.name.trim() === "") {
      pushIssue(issues.errors, "error", `animations[${index}].name`, "animation name is required", key);
    }
    if (!animation.start || typeof animation.start !== "object") {
      pushIssue(issues.errors, "error", `animations[${index}].start`, "start movement is required", key);
    } else {
      if (typeof animation.start.x !== "string") pushIssue(issues.errors, "error", `animations[${index}].start.x`, "start.x must be a string", key);
      if (typeof animation.start.y !== "string") pushIssue(issues.errors, "error", `animations[${index}].start.y`, "start.y must be a string", key);
      if (typeof animation.start.interval !== "string") pushIssue(issues.errors, "error", `animations[${index}].start.interval`, "start.interval must be a string", key);
    }
    if (!animation.sequence || typeof animation.sequence !== "object") {
      pushIssue(issues.errors, "error", `animations[${index}].sequence`, "sequence is required", key);
      return;
    }

    const seq = animation.sequence;
    if (!Array.isArray(seq.frames) || seq.frames.length === 0) {
      pushIssue(issues.errors, "error", `animations[${index}].sequence.frames`, "sequence.frames must contain at least one frame", key);
    }
    if (typeof seq.repeat !== "string") {
      pushIssue(issues.errors, "error", `animations[${index}].sequence.repeat`, "sequence.repeat must be a string", key);
    }
    if (!isNonNegativeInteger(seq.repeat_from)) {
      pushIssue(issues.errors, "error", `animations[${index}].sequence.repeat_from`, "repeat_from must be a non-negative integer", key);
    } else if (Array.isArray(seq.frames) && seq.repeat_from >= seq.frames.length) {
      pushIssue(issues.errors, "error", `animations[${index}].sequence.repeat_from`, "repeat_from must refer to a frame index inside sequence.frames", key);
    }
    if (typeof seq.action === "string" && seq.action.trim() === "") {
      pushIssue(issues.warnings, "warning", `animations[${index}].sequence.action`, "empty action will be ignored", key);
    }
    if (Array.isArray(seq.frames)) {
      const tileCount = Math.max(1, (image.tiles_x as number || 0) * (image.tiles_y as number || 0));
      seq.frames.forEach((frame, frameIndex) => {
        if (!Number.isInteger(frame) || frame < 0) {
          pushIssue(issues.errors, "error", `animations[${index}].sequence.frames[${frameIndex}]`, "frame indices must be non-negative integers", key);
        } else if (tileCount > 0 && frame >= tileCount) {
          pushIssue(issues.errors, "error", `animations[${index}].sequence.frames[${frameIndex}]`, `frame index ${frame} exceeds the sprite grid`, key);
        }
      });
    }

    validateTransitionGroup(issues, seq.nexts, `animations[${index}].sequence.nexts`, key, animationIds);
    validateTransitionGroup(issues, animation.border, `animations[${index}].border`, key, animationIds);
    validateTransitionGroup(issues, animation.gravity, `animations[${index}].gravity`, key, animationIds);
  });

  duplicateIds.forEach((id) => {
    pushIssue(issues.errors, "error", "animations", `animation id ${id} is duplicated`, `animation:${id}`);
  });

  (document.spawns || []).forEach((spawn, index) => {
    const key = `spawn:${spawn.id}`;
    if (!Number.isInteger(spawn.id) || spawn.id <= 0) {
      pushIssue(issues.errors, "error", `spawns[${index}].id`, "spawn id must be a positive integer", key);
    }
    if (!isNonNegativeInteger(spawn.probability)) {
      pushIssue(issues.errors, "error", `spawns[${index}].probability`, "spawn probability must be a non-negative integer", key);
    }
    if (typeof spawn.x !== "string") pushIssue(issues.errors, "error", `spawns[${index}].x`, "spawn x must be a string", key);
    if (typeof spawn.y !== "string") pushIssue(issues.errors, "error", `spawns[${index}].y`, "spawn y must be a string", key);
    if (!spawn.next) {
      pushIssue(issues.errors, "error", `spawns[${index}].next`, "spawn.next is required", key);
      return;
    }
    if (!isNonNegativeInteger(spawn.next.probability)) {
      pushIssue(issues.errors, "error", `spawns[${index}].next.probability`, "spawn next probability must be a non-negative integer", key);
    }
    if (!Number.isInteger(spawn.next.value) || spawn.next.value <= 0) {
      pushIssue(issues.errors, "error", `spawns[${index}].next.value`, "spawn target must be a positive integer", key);
    } else if (!animationIds.has(spawn.next.value)) {
      pushIssue(issues.errors, "error", `spawns[${index}].next.value`, `target animation ${spawn.next.value} does not exist`, key);
    }
  });

  (document.children || []).forEach((child, index) => {
    const key = `child:${child.animation_id}:${index}`;
    if (!Number.isInteger(child.animation_id) || child.animation_id <= 0) {
      pushIssue(issues.errors, "error", `children[${index}].animation_id`, "animation_id must be a positive integer", key);
    } else if (!animationIds.has(child.animation_id)) {
      pushIssue(issues.errors, "error", `children[${index}].animation_id`, `target animation ${child.animation_id} does not exist`, key);
    }
    if (typeof child.x !== "string") pushIssue(issues.errors, "error", `children[${index}].x`, "child x must be a string", key);
    if (typeof child.y !== "string") pushIssue(issues.errors, "error", `children[${index}].y`, "child y must be a string", key);
    if (!child.next) {
      pushIssue(issues.errors, "error", `children[${index}].next`, "child.next is required", key);
      return;
    }
    if (!isNonNegativeInteger(child.next.probability)) {
      pushIssue(issues.errors, "error", `children[${index}].next.probability`, "child next probability must be a non-negative integer", key);
    }
    if (!Number.isInteger(child.next.value) || child.next.value <= 0) {
      pushIssue(issues.errors, "error", `children[${index}].next.value`, "child target must be a positive integer", key);
    } else if (!animationIds.has(child.next.value)) {
      pushIssue(issues.errors, "error", `children[${index}].next.value`, `target animation ${child.next.value} does not exist`, key);
    }
  });

  return issues;
}
