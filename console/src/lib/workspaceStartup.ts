export type WorkspaceStartupProgress = { stage: string; attempt: number };

const reasons: Record<string, { title: string; detail: string }> = {
  queued: { title: "等待实例化", detail: "实例已进入启动队列，正在等待运行资源。" },
  starting: { title: "正在准备实例", detail: "正在分配运行环境，接下来安装部门配置。" },
  docker_create: { title: "正在实例化", detail: "正在创建运行环境并安装部门配置。" },
  reconcile: { title: "正在更新实例", detail: "正在应用部门配置并重新启动服务。" },
  read_token: { title: "正在初始化部门配置", detail: "正在加载部门配置，为聊天和任务服务准备连接。" },
  waiting_instance: { title: "等待实例化完成", detail: "运行环境尚未启动完成，完成后会继续检查各项服务。" },
  waiting_task_service: { title: "等待任务服务启动", detail: "正在等待任务调度服务就绪，随后检查聊天服务。" },
  waiting_chat_gateway: { title: "等待聊天服务启动", detail: "任务服务已就绪，正在等待聊天服务建立连接。" },
  syncing_department: { title: "正在准备部门会话", detail: "聊天服务已启动，正在同步当前部门配置。" },
  connecting_chat_gateway: { title: "正在连接聊天通道", detail: "部门配置已准备好，正在建立实时聊天连接。" },
  connecting: { title: "正在连接服务", detail: "正在连接服务入口，随后检查聊天和任务服务。" },
  waiting_services: { title: "等待聊天与任务服务就绪", detail: "已连接服务入口，正在确认聊天通道和任务服务可用。" },
  reconnecting: { title: "正在恢复服务连接", detail: "服务连接暂时中断，将自动重试并重新检查聊天和任务服务。" },
  loading_account: { title: "正在加载工作区账号", detail: "正在读取账号信息，随后加载部门和聊天记录。" },
  loading_departments: { title: "正在加载部门", detail: "正在读取已安装的部门配置。" },
  loading_history: { title: "正在加载聊天记录", detail: "正在恢复当前会话，随后建立服务连接。" },
};

export function workspaceStartupReason(stage?: string | null) {
  return reasons[stage || "waiting_instance"] || reasons.waiting_instance;
}
