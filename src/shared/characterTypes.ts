/** 侧栏「角色」：按书持久化在 file.meta 中的结构（渲染进程为主，类型供共享） */

export type CharacterGender = "male" | "female" | "unknown";

/** 本书推断画风（书籍级，非单角色） */
export type CharacterBookStylePersisted = {
  stylePrefixZh: string;
  styleNoteZh?: string;
  updatedAt?: number;
};

/** 侧栏角色卡片一条记录 */
export type CharacterRosterEntry = {
  id: string;
  displayName: string;
  gender: CharacterGender;
  /** 年龄或「少年」等描述；空表示背面不展示年龄 */
  ageText: string;
  /** 身份/职业；空表示背面不展示该行 */
  identity: string;
  bio: string;
  relations: string;
  /** 角色形象描述（自然语言；历史字段名 promptZh） */
  promptZh: string;
  /** SD 系高级：负面描述；云端自然语言接口可留空 */
  negativeZh: string;
  /** 检索折叠区持久化正文 */
  retrieveThinkingText: string;
};
