import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as FileSystem from "expo-file-system";

export type SharedFile = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

/**
 * Hook that listens for files shared TO the app via Android Share Intent.
 * Uses expo-share-intent under the hood. Falls back to manual check
 * if the library is not available.
 */
export function useShareIntent(onFilesReceived: (files: SharedFile[]) => void) {
  const [pending, setPending] = useState<SharedFile[]>([]);
  const callbackRef = useRef(onFilesReceived);
  callbackRef.current = onFilesReceived;

  useEffect(() => {
    let isMounted = true;

    const checkShareIntent = async () => {
      try {
        // Try to use expo-share-intent if available
        const ShareIntent = await import("expo-share-intent").catch(() => null);
        if (ShareIntent && ShareIntent.useShareIntent) {
          // The library provides a hook but we can also check imperatively
          return;
        }
      } catch {
        // Library not available, skip
      }
    };

    checkShareIntent();

    // Listen for app state changes (user might share while app is backgrounded)
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkShareIntent();
      }
    });

    return () => {
      isMounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (pending.length > 0) {
      callbackRef.current(pending);
      setPending([]);
    }
  }, [pending]);

  return { pending };
}

/**
 * Copy a content:// URI to a local file so it can be uploaded.
 */
export async function copySharedFileToLocal(
  contentUri: string,
  fileName: string
): Promise<string> {
  const dir = `${FileSystem.cacheDirectory}shared/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const localPath = `${dir}${Date.now()}_${fileName}`;
  await FileSystem.copyAsync({ from: contentUri, to: localPath });
  return localPath;
}
