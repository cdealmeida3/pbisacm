import { decodeBytes } from '../../core/shared/text.ts';

/**
 * The workspace folder (the "Workbench" folder of the team's channel, synced to the computer):
 *   reports/                  ServiceNow reports, .csv or .xlsx (filed by a flow, or put there by hand; a report directly in the folder is found too)
 *   outbox/                   messages a manager chose to send; a flow sends each one from the shared mailbox and moves it to sent/
 *   sent/                     messages the flow has sent
 *   replies/                  emails that arrived in the shared mailbox with one of our references in the subject
 *   replies/archive/yyyy-mm/  replies whose cases are closed
 *   data/runs/                what the last 10 loaded CI reports showed
 *   data/runs/relationships/  the last 10 loaded Relationship reports
 *   data/archive/yyyy-mm/     older runs (Relationship reports in relationships/, removed loads in removed/)
 *   data/journal/yyyy-mm/     what each manager did, one file per person and month (so two people never write the same file)
 *   data/state.json           summary of the archived part (see src/core/memory/memory.ts)
 *   data/settings.json
 */
export interface FileInfo { name: string; modified: number }

export interface Workspace {
  label: string;
  list(folder: string): Promise<FileInfo[]>;
  /** The names of the folders inside a folder. */
  listFolders(folder: string): Promise<string[]>;
  remove(path: string): Promise<void>;
  readText(path: string): Promise<string>;
  /** The file as bytes (a report can be an .xlsx), or null when it does not exist. */
  readBytes(path: string): Promise<Uint8Array | null>;
  writeText(path: string, text: string): Promise<void>;
}

/** The parts of the File System Access API the app uses (Edge and Chrome). */
interface DirectoryHandle {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  values(): AsyncIterable<{ kind: string; name: string }>;
  removeEntry(name: string): Promise<void>;
  requestPermission?(options: { mode: string }): Promise<string>;
}
interface FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

export class FolderWorkspace implements Workspace {
  label: string;
  private root: DirectoryHandle;
  constructor(root: DirectoryHandle) { this.root = root; this.label = root.name; }

  private async folder(path: string, create: boolean): Promise<DirectoryHandle | null> {
    let current = this.root;
    for (const part of path.split('/').filter(Boolean)) {
      try { current = await current.getDirectoryHandle(part, { create }); } catch { return null; }
    }
    return current;
  }

  async list(folder: string): Promise<FileInfo[]> {
    const handle = await this.folder(folder, false);
    if (!handle) return [];
    const files: FileInfo[] = [];
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue;
      const file = await (await handle.getFileHandle(entry.name)).getFile();
      files.push({ name: entry.name, modified: file.lastModified });
    }
    return files;
  }

  async listFolders(folder: string): Promise<string[]> {
    const handle = await this.folder(folder, false);
    if (!handle) return [];
    const names: string[] = [];
    for await (const entry of handle.values()) if (entry.kind === 'directory') names.push(entry.name);
    return names;
  }

  async remove(path: string): Promise<void> {
    const parts = path.split('/');
    const name = parts.pop()!;
    const handle = await this.folder(parts.join('/'), false);
    try { if (handle) await handle.removeEntry(name); } catch { /* already gone */ }
  }

  async readText(path: string): Promise<string> {
    const parts = path.split('/');
    const name = parts.pop()!;
    const handle = await this.folder(parts.join('/'), false);
    if (!handle) return '';
    try {
      const file = await (await handle.getFileHandle(name)).getFile();
      return decodeBytes(Array.from(new Uint8Array(await file.arrayBuffer())));
    } catch { return ''; }
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const parts = path.split('/');
    const name = parts.pop()!;
    const handle = await this.folder(parts.join('/'), false);
    if (!handle) return null;
    try { return new Uint8Array(await (await (await handle.getFileHandle(name)).getFile()).arrayBuffer()); } catch { return null; }
  }

  async writeText(path: string, text: string): Promise<void> {
    const parts = path.split('/');
    const name = parts.pop()!;
    const handle = (await this.folder(parts.join('/'), true))!;
    const writable = await (await handle.getFileHandle(name, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
  }
}

/** Keeps everything in memory: the demo, and browsers without folder access. */
export class MemoryWorkspace implements Workspace {
  label: string;
  constructor(label = 'Demo (nothing is saved)') { this.label = label; }
  files = new Map<string, { text: string; bytes?: Uint8Array; modified: number }>();
  private clock = Date.now();

  async list(folder: string): Promise<FileInfo[]> {
    const prefix = folder ? `${folder.replace(/\/$/, '')}/` : '';
    const found: FileInfo[] = [];
    this.files.forEach((file, path) => {
      if (path.startsWith(prefix) && path.slice(prefix.length).indexOf('/') < 0) found.push({ name: path.slice(prefix.length), modified: file.modified });
    });
    return found;
  }
  async listFolders(folder: string): Promise<string[]> {
    const prefix = folder ? `${folder.replace(/\/$/, '')}/` : '';
    const found = new Set<string>();
    this.files.forEach((_file, path) => {
      if (!path.startsWith(prefix)) return;
      const rest = path.slice(prefix.length);
      if (rest.indexOf('/') > 0) found.add(rest.slice(0, rest.indexOf('/')));
    });
    return Array.from(found);
  }
  async remove(path: string): Promise<void> { this.files.delete(path); }
  async readText(path: string): Promise<string> { return this.files.get(path)?.text ?? ''; }
  async readBytes(path: string): Promise<Uint8Array | null> { const file = this.files.get(path); return file ? file.bytes ?? new TextEncoder().encode(file.text) : null; }
  /** Keeps a picked report file, so "Choose reports" can list it again (only in memory). */
  keepFile(path: string, bytes: Uint8Array, modified: number): void { this.files.set(path, { text: '', bytes, modified }); }
  async writeText(path: string, text: string): Promise<void> { this.files.set(path, { text, modified: ++this.clock }); }
}

/* The chosen folder is remembered in the browser, so the next visit needs one click instead of browsing again. */
function handleStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('sacm-workbench', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('handles');
    open.onsuccess = () => resolve(open.result.transaction('handles', mode).objectStore('handles'));
    open.onerror = () => reject(open.error);
  });
}

export async function rememberFolder(handle: unknown): Promise<void> {
  try { (await handleStore('readwrite')).put(handle, 'workspace'); } catch { /* remembering is a convenience only */ }
}

export async function rememberedFolder(): Promise<DirectoryHandle | null> {
  try {
    const store = await handleStore('readonly');
    return await new Promise((resolve) => {
      const request = store.get('workspace');
      request.onsuccess = () => resolve((request.result as DirectoryHandle | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export const canPickFolder = (): boolean => 'showDirectoryPicker' in window;

export async function pickFolder(remembered: DirectoryHandle | null): Promise<FolderWorkspace | null> {
  const host = window as unknown as { showDirectoryPicker?: (options: { mode: string }) => Promise<DirectoryHandle> };
  if (!host.showDirectoryPicker) return null;
  let handle = remembered;
  if (handle && handle.requestPermission && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') handle = null;
  if (!handle) handle = await host.showDirectoryPicker({ mode: 'readwrite' });
  await rememberFolder(handle);
  return new FolderWorkspace(handle);
}
