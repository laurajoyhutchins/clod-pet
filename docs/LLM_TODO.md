# LLM Feature TODO

## Overview
Add LLM chat functionality to clod-pet for AI-powered pet interactions.

## Tasks

### Phase 1: Backend
- [ ] Review and finalize provider implementations
  - [x] OpenAI
  - [x] Anthropic
  - [x] Gemini
  - [x] Ollama
- [x] Add streaming support for real-time responses
- [ ] Add proper error handling and retries
- [ ] Add configuration validation

### Phase 2: API
- [x] `/api/llm/chat` endpoint
- [x] Add `/api/llm/stream` endpoint for streaming
- [ ] Add health check for LLM provider connectivity

### Phase 3: Frontend
- [x] Add chat UI component
- [ ] Add settings panel for LLM configuration
- [x] Add streaming response display

### Phase 4: Testing
- [ ] Add unit tests for all providers
- [ ] Add integration tests for API
- [ ] Add e2e tests for chat flow

## Notes
- Currently supports: OpenAI, Anthropic, Gemini, Ollama
- Configuration stored in `clod-pet-settings.json`
- Default provider: Ollama (localhost:11434)