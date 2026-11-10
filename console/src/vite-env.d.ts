/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** 游戏部内嵌的游戏前端地址（如 http://<HOST_IP>:7330）；为空则显示「未配置」。 */
  readonly VITE_GAME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
