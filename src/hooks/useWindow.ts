import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect } from "react";

// Helper function to check if any popover is open in the DOM
const isAnyPopoverOpen = (): boolean => {
  const popoverContents = document.querySelectorAll(
    "[data-radix-popper-content-wrapper]"
  );
  return popoverContents.length > 0;
};

// Module-level shared state across all hook instances to coordinate window height and prevent fighting
let globalLastRequestedHeight: number | null = null;
let globalResizeTimer: ReturnType<typeof setTimeout> | null = null;

export const resizeWindow = async (expanded: boolean) => {
  try {
    const window = getCurrentWebviewWindow();

    if (!expanded && isAnyPopoverOpen()) {
      return;
    }

    const newHeight = expanded ? 600 : 54;

    // Skip if the same height was requested recently
    if (globalLastRequestedHeight === newHeight) {
      return;
    }

    // Debounce multiple quick calls
    if (globalResizeTimer) {
      clearTimeout(globalResizeTimer);
      globalResizeTimer = null;
    }

    // Use a short debounce to avoid rapid toggling when responses stream
    globalResizeTimer = setTimeout(async () => {
      try {
        // Double check right before shrinking: if any popover is open, abort shrinking
        if (newHeight === 54 && isAnyPopoverOpen()) {
          return;
        }
        await invoke("set_window_height", {
          window,
          height: newHeight,
        });
        globalLastRequestedHeight = newHeight;
      } catch (error) {
        console.error("Failed to resize window:", error);
      } finally {
        globalResizeTimer = null;
      }
    }, 120);
  } catch (error) {
    console.error("Failed to schedule window resize:", error);
  }
};

export const useWindowResize = () => {
  // Setup drag handling and popover monitoring
  useEffect(() => {
    let isDragging = false;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isDragRegion = target.closest('[data-tauri-drag-region="true"]');

      if (isDragRegion) {
        isDragging = true;
      }
    };

    const handleMouseUp = async () => {
      if (isDragging) {
        isDragging = false;

        setTimeout(() => {
          if (!isAnyPopoverOpen()) {
            resizeWindow(false);
          }
        }, 100);
      }
    };

    const observer = new MutationObserver(() => {
      if (!isAnyPopoverOpen()) {
        resizeWindow(false);
      }
    });

    // Observe the body for changes to detect popover open/close
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      observer.disconnect();
    };
  }, [resizeWindow]);

  return { resizeWindow };
};

interface UseWindowFocusOptions {
  onFocusLost?: () => void;
  onFocusGained?: () => void;
}

export const useWindowFocus = ({
  onFocusLost,
  onFocusGained,
}: UseWindowFocusOptions = {}) => {
  const handleFocusChange = useCallback(
    async (focused: boolean) => {
      if (focused && onFocusGained) {
        onFocusGained();
      } else if (!focused && onFocusLost) {
        onFocusLost();
      }
    },
    [onFocusLost, onFocusGained]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupFocusListener = async () => {
      try {
        const window = getCurrentWebviewWindow();

        // Listen to focus change events
        unlisten = await window.onFocusChanged(({ payload: focused }) => {
          handleFocusChange(focused);
        });
      } catch (error) {
        console.error("Failed to setup focus listener:", error);
      }
    };

    setupFocusListener();

    // Cleanup
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleFocusChange]);
};
