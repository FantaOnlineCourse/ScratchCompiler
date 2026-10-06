import type { GUIStorage, ScratchGuiGlobal } from "./gui-global";

/**
 * 取代上游的 LegacyStorage：不連 projects.scratch.mit.edu、不連 assets.scratch.mit.edu、
 * 不設背包與雲端變數（FR-EDT-012）。
 *
 * - 預設專案的素材由上游內建，直接放進 builtinHelper。
 * - 素材庫（角色、造型、背景、音效）改從**本網域**的 /library-assets/ 取檔，
 *   檔案由 scripts/mirror-library-assets.mjs 在建置前鏡像下來。
 * - 專案永遠不存到任何伺服器：存檔是主平台的事，經 postMessage 進行。
 */
export const LIBRARY_ASSET_BASE = "/library-assets";

export interface OfflineStorage extends GUIStorage {
  /** 以目前介面語言產生的空白預設專案（角色名稱已翻譯）。 */
  defaultProjectJson(): string;
}

export function createOfflineStorage(GUI: ScratchGuiGlobal): OfflineStorage {
  const storage = new GUI.ScratchStorage();
  let translator: unknown;

  const cacheDefaultProject = () => {
    for (const asset of GUI.buildDefaultProject(translator)) {
      storage.builtinHelper._store(
        storage.AssetType[asset.assetType],
        storage.DataFormat[asset.dataFormat],
        asset.data,
        asset.id,
      );
    }
  };
  cacheDefaultProject();

  const libraryUrl = (assetId: string, dataFormat: string) => `${LIBRARY_ASSET_BASE}/${assetId}.${dataFormat}`;

  storage.addWebStore(
    [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap, storage.AssetType.Sound],
    (asset) => libraryUrl(asset.assetId, asset.dataFormat),
  );
  // 音樂擴充的樂器音色，上游已隨 static/ 一起發佈。
  storage.addWebStore(
    [storage.AssetType.Sound],
    (asset) => `/static/extension-assets/scratch3_music/${asset.assetId}.${asset.dataFormat}`,
  );

  return {
    scratchStorage: storage,
    getLibraryAssetUrl: libraryUrl,
    // 預設專案的角色名稱會隨介面語言翻譯，語言設定好後重新快取一次。
    setTranslatorFunction: (fn) => {
      translator = fn;
      cacheDefaultProject();
    },
    defaultProjectJson: () =>
      String(GUI.buildDefaultProject(translator).find((a) => a.assetType === "Project")?.data ?? ""),
    saveProject: () => Promise.reject(new Error("本編輯器不直接存檔，存檔由主平台負責")),
    setProjectHost: () => {},
    setAssetHost: () => {},
    setBackpackHost: () => {},
    setProjectToken: () => {},
    setProjectMetadata: () => {},
  };
}
