/**
 * 上游 scratch-gui standalone 版（dist/scratch-gui-standalone.js）以 <script> 載入後掛在
 * window.GUI 上。這裡只宣告本應用用到的最小介面，型別依據上游的
 * dist/types/index-standalone.d.ts 與 gui-config.d.ts。
 */

export interface ScratchVM {
  loadProject(project: ArrayBuffer | string): Promise<void>;
  saveProjectSb3(): Promise<Blob>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  stopAll(): void;
}

export interface ScratchStorageInstance {
  AssetType: Record<string, unknown>;
  DataFormat: Record<string, unknown>;
  builtinHelper: { _store(type: unknown, format: unknown, data: unknown, id: unknown): void };
  addWebStore(types: unknown[], getUrl: (asset: { assetId: string; dataFormat: string }) => string): void;
}

export interface GUIStorage {
  scratchStorage: ScratchStorageInstance;
  getLibraryAssetUrl?(assetId: string, dataFormat: string): string;
  saveProject(...args: unknown[]): Promise<{ id: string | number }>;
  setTranslatorFunction?(fn: unknown): void;
  setProjectHost?(host: string): void;
  setAssetHost?(host: string): void;
  setBackpackHost?(host: string): void;
  setProjectToken?(token: string): void;
  setProjectMetadata?(id: unknown): void;
}

export interface DefaultProjectAsset {
  id: string | number;
  assetType: string;
  dataFormat: string;
  data: unknown;
}

export interface EditorStateInstance {
  store: {
    getState(): { scratchGui?: { projectState?: { loadingState?: string } } };
    subscribe(listener: () => void): () => void;
    dispatch(action: { type: string; [key: string]: unknown }): void;
  };
}

export interface StandaloneRoot {
  render(props: Record<string, unknown>): void;
  unmount(): void;
}

export interface ScratchGuiGlobal {
  EditorState: new (params: { locale?: string }, configFactory: () => { storage: GUIStorage }) => EditorStateInstance;
  createStandaloneRoot(state: EditorStateInstance, container: HTMLElement): StandaloneRoot;
  setAppElement(el: HTMLElement): void;
  ScratchStorage: new () => ScratchStorageInstance;
  buildDefaultProject(translator?: unknown): DefaultProjectAsset[];
}

declare global {
  interface Window {
    GUI?: ScratchGuiGlobal;
  }
}
