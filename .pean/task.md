P57.2b Working Draft TTL Hardening

saveDraft(draft) 必须像 saveRecord 一样兜底：
- 如果 draft.expiresAt 为空，则用 draft.createdAt + WORKING_TTL_MS 自动补
- 如果 draft.expiresAt 已显式提供，则保留
- 添加测试：
  1. saveDraft without expiresAt → 自动设置 7 天 TTL
  2. saveDraft with custom expiresAt → 保留 custom
  3. purgeExpired 仍能清理过期 draft