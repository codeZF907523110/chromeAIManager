/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare global {
  interface TabInfo {
    id: number
    title: string
    url: string
    windowId: number
    active: boolean
    groupId: number
    index: number
    muted: boolean
  }

  interface BookmarkNode {
    id: string
    title?: string
    url?: string
    parentId?: string
    index?: number
    dateAdded?: number
    children?: BookmarkNode[]
  }

  const chrome: {
    runtime: {
      sendMessage(message: any): Promise<any>
      onMessage: {
        addListener(
          callback: (msg: any, sender: any, sendResponse: (response: any) => void) => boolean | void
        ): void
        removeListener(
          callback: (msg: any, sender: any, sendResponse: (response: any) => void) => boolean | void
        ): void
      }
      onInstalled: {
        addListener(callback: (details: { reason: string }) => void): void
      }
      getContexts(options: any): Promise<any[]>
      getURL(path: string): string
      getManifest(): { version: string }
      id?: string
    }
    tabs: {
      query(query: any): Promise<any[]>
      sendMessage(tabId: number, message: any): Promise<any>
      get(tabId: number): Promise<any>
      update(tabId: number, updateInfo: any): Promise<any>
      create(createProps: any): Promise<any>
      remove(tabIds: number | number[]): Promise<number | number[]>
      move(tabIds: number[], options: any): Promise<number[]>
      group(properties: any): Promise<number>
      ungroup(tabIds: number[]): Promise<void>
      captureVisibleTab(windowId: number, options?: any): Promise<string>
      getZoom(tabId: number): Promise<number>
      setZoom(tabId: number, zoomFactor: number): Promise<void>
    }
    windows: {
      getCurrent(options?: any): Promise<any>
      getLastFocused(options?: any): Promise<any>
      getAll(options?: any): Promise<any[]>
      create(createProps?: any): Promise<any>
      update(windowId: number, updateInfo: any): Promise<any>
    }
    bookmarks: {
      getTree(): Promise<any[]>
      getChildren(id: string): Promise<any[]>
      search(query: string | object): Promise<any[]>
      get(id: string): Promise<any[]>
      create(bookmark: any): Promise<any>
      update(id: string, changes: any): Promise<any>
      remove(id: string): Promise<void>
      move(id: string, destination: any): Promise<any>
    }
    history: {
      search(query: any): Promise<any[]>
      deleteRange(range: any): Promise<void>
      deleteAll(): Promise<void>
      deleteUrl(url: string): Promise<void>
    }
    storage: {
      local: {
        get(keys?: string | string[] | object | null): Promise<object>
        set(items: object): Promise<void>
        remove(keys?: string | string[]): Promise<void>
        clear(): Promise<void>
      }
      session: {
        get(keys?: string | string[] | object | null): Promise<object>
        set(items: object): Promise<void>
        remove(keys?: string | string[]): Promise<void>
        clear(): Promise<void>
      }
      onChanged: {
        addListener(callback: (changes: object, area: string) => void): void
        removeListener(callback: (changes: object, area: string) => void): void
      }
    }
    permissions: {
      contains(permissions: any): Promise<boolean>
      request(permissions: any): Promise<boolean>
      remove(permissions: any): Promise<boolean>
    }
    sidePanel: {
      open(options: { windowId?: number; tabId?: number }): Promise<void>
      setPanelBehavior(options: any): Promise<void>
      setOptions(options: any): Promise<void>
    }
    scripting: {
      executeScript(options: { target: { tabId: number }; files: string[] }): Promise<any[]>
    }
    management: {
      getAll(): Promise<any[]>
      get(id: string): Promise<any>
      setEnabled(id: string, enabled: boolean): Promise<any>
      uninstall(id: string): Promise<void>
      onEnabled: { addListener(callback: (id: string) => void): void }
      onDisabled: { addListener(callback: (id: string) => void): void }
    }
    downloads: {
      download(options: any): Promise<number>
      search(query: any): Promise<any[]>
      cancel(downloadId: number): Promise<boolean>
      erase(query: any): Promise<number>
      show(downloadId: number): void
      hide(downloadId: number): void
      onCreated: { addListener(callback: (download: any) => void): void }
      onChanged: { addListener(callback: (downloadDelta: any) => void): void }
    }
    contextMenus: {
      create(createProperties: any): Promise<number>
      remove(menuItemId: number): Promise<void>
      removeAll(): Promise<void>
      update(menuItemId: number | string, updateProperties: any): Promise<void>
    }
    notifications: {
      create(options: any): Promise<string>
      clear(notificationId: string): Promise<boolean>
      getAll(): Promise<object>
      onclick: { addListener(callback: (notificationId: string) => void): void }
    }
    offscreen: {
      createDocument(options: any): Promise<void>
    }
    commands: {
      onCommand: {
        addListener(callback: (command: string) => void): void
      }
    }
    action: {
      onClicked: {
        addListener(callback: (tab: any) => void): void
      }
    }
    fontSettings: {
      getFontSize(): Promise<any>
      setFontSize(options: any): Promise<void>
      getFontFamily(options: any): Promise<any>
      setFontFamily(options: any): Promise<void>
    }
    settings: {
      private: {
        get(key: string): Promise<any>
      }
    }
    topSites: {
      get(): Promise<any[]>
    }
    contentSettings: {
      get(details: {
        primaryPattern: string
        resourceIdentifier?: { id: string; name?: string }
        secondaryPattern?: string
      }): Promise<any>
      set(details: {
        primaryPattern: string
        resourceIdentifier?: { id: string; name?: string }
        secondaryPattern?: string
        setting: any
        scope?: 'regular' | 'incognito_session_only' | 'incognito_persistent'
      }): Promise<void>
    }
    cookies: {
      getAll(filter: any): Promise<any[]>
      remove(details: any): Promise<void>
    }
    tabGroups: {
      get(groupId: number): Promise<any>
      update(groupId: number, updateProperties: any): Promise<any>
      query(queryOptions?: any): Promise<any[]>
    }
    sessions: {
      getRecentlyClosed(options?: any): Promise<any[]>
      restore(sessionId: string): Promise<any>
    }
  }

  namespace chrome {
    namespace tabs {
      interface QueryOptions {
        active?: boolean
        currentWindow?: boolean
        windowId?: number
        [key: string]: any
      }
      interface CreateProperties {
        url?: string
        active?: boolean
        selected?: boolean
        windowId?: number
        [key: string]: any
      }
      interface UpdateProperties {
        pinned?: boolean
        muted?: boolean
        index?: number
        highlighted?: boolean
        active?: boolean
        selected?: boolean
        focused?: boolean
        discarded?: boolean
        autoDiscardable?: boolean
        incognito?: boolean
        url?: string
        highlighted?: boolean
        openerTabId?: number
        [key: string]: any
      }
      interface GroupProperties {
        tabIds: number[]
        createProperties?: chrome.tabs.GroupCreateProperties
        title?: string
        color?: TabGroupColor
        [key: string]: any
      }
      interface GroupCreateProperties {
        windowId?: number
        tabIds?: number[]
        title?: string
        color?: TabGroupColor
        [key: string]: any
      }
      type TabGroupColor = 'blue' | 'cyan' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'grey'
      interface Tab extends TabInfo {
        highlighted?: boolean
        incognito?: boolean
        windowId?: number
        status?: 'complete' | 'loading'
        pinned?: boolean
        evalIndex?: number
        evalAllowed?: boolean
        opTabId?: number
        highlighted?: boolean
        discarded?: boolean
        autoDiscardable?: boolean
        lastAccessed?: number
        audible?: boolean
        muted?: boolean
        favIconUrl?: string
        pendingUrl?: string
        index?: number
        highlighted?: boolean
      }
      interface MoveOptions {
        index: number
      }
    }

    namespace bookmarks {
      interface BookmarkTreeNode {
        id: string
        parentId?: string
        index?: number
        url?: string
        title?: string
        dateAdded?: number
        dateGroupModified?: number
        dateGroupCreated?: number
        children?: BookmarkTreeNode[]
        unfiledBookmarks?: boolean
        type?: 'url' | 'folder'
      }
      interface CreateDetails {
        index?: number
        parentId?: string
        title?: string
        url?: string
        type?: string
      }
      interface MoveProperties {
        index: number
        parentId?: string
      }
      interface BookmarkChangeInfo {
        title?: string
        url?: string
      }
    }

    namespace windows {
      interface QueryOptions {
        windowTypes?: string[]
        focused?: boolean
        currentWindow?: boolean
        [key: string]: any
      }
      interface CreateData {
        url?: string | string[]
        focused?: boolean
        type?: 'normal' | 'popup' | 'panel' | 'detached_panel'
        state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen'
        width?: number
        height?: number
        left?: number
        top?: number
        requiredFeatures?: string[]
        optionalFeatures?: string[]
        [key: string]: any
      }
      interface UpdateInfo {
        focused?: boolean
        state?: WindowState
        [key: string]: any
      }
      type WindowState = 'normal' | 'minimized' | 'maximized' | 'fullscreen'
    }

    namespace history {
      interface TimeRange {
        startTime: number
        endTime: number
      }
    }

    namespace fontSettings {
      type GenericFamily = 'standard' | 'serif' | 'sans-serif' | 'cursive' | 'fantasy' | 'monospace'
    }

    namespace actions {
      // placeholder for any actions namespace usage
    }
  }
}

export {}
