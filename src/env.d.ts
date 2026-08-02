/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare const chrome: {
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
      addListener(callback: () => void): void
    }
    id?: string
  }
  tabs: {
    query(query: any): Promise<any[]>
    sendMessage(tabId: number, message: any): Promise<any>
    get(tabId: number): Promise<any>
    update(tabId: number, updateInfo: any): Promise<any>
    create(createProps: any): Promise<any>
    remove(tabIds: number | number[]): Promise<number | number[]>
    move(tabId: number, index: number): Promise<any>
  }
  windows: {
    getCurrent(options?: any): Promise<any>
    create(createProps?: any): Promise<any>
    update(windowId: number, updateInfo: any): Promise<any>
  }
  bookmarks: {
    getTree(): Promise<any[]>
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
    open(options: { windowId?: number }): Promise<void>
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
}
