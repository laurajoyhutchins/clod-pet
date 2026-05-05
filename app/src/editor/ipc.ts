import type { EditorLayoutState, EditorReadResult, EditorRecentDocument, EditorSaveResult, ModernPetDocument } from "./types";

export const editorApi = window.clodPet.editor;

export function showEditor(initialPath?: string) {
  return editorApi.show(initialPath);
}

export function openPetDirectory() {
  return editorApi.openPetDirectory();
}

export function openAnimationFile() {
  return editorApi.openAnimationFile();
}

export function readDocument(path: string) {
  return editorApi.readDocument({ path });
}

export function saveDocument(documentPath: string, document: ModernPetDocument, layout?: EditorLayoutState) {
  return editorApi.saveDocument({ documentPath, document, layout });
}

export function saveDocumentAs(documentPath: string, document: ModernPetDocument, layout?: EditorLayoutState) {
  return editorApi.saveDocumentAs({ documentPath, document, layout });
}

export function showItemInFolder(path: string) {
  return editorApi.showItemInFolder(path);
}

export function getRecentDocuments(): Promise<EditorRecentDocument[]> {
  return editorApi.getRecentDocuments();
}

export type { EditorReadResult, EditorSaveResult };
