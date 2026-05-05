# Shared Store

This folder contains the shared world store and its type definitions.

## Files

- `index.ts` - store implementation plus type re-exports.
- `state.ts` - canonical state shapes, helpers, and shared data types.

## Purpose

- Provide a single state model for main, preload, and renderer code.
- Keep state transitions predictable and serializable.
