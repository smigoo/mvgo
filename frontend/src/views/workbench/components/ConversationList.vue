<template>
  <div class="conversation-list">
    <div class="list-header">
      <h2>
        <img src="/logo.png" alt="晓界工坊" class="logo-img" />
        晓界工坊工作台
        <span class="badge">NEW</span>
      </h2>
      <div class="header-actions">
        <button class="back-btn" @click="router.push('/')" title="返回网站首页">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          返回
        </button>
        <button class="new-chat-btn" @click="$emit('create')" title="新建对话">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建对话
        </button>
      </div>
    </div>

    <div class="search-box">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索对话..."
      />
    </div>

    <!-- 批量操作工具栏 -->
    <div v-if="selectionMode" class="batch-toolbar">
      <div class="toolbar-left">
        <input
          type="checkbox"
          :checked="isAllSelected"
          @change="toggleSelectAll"
        />
        <span class="selected-count">已选 {{ selectedIds.length }} 项</span>
      </div>
      <div class="toolbar-right">
        <button class="toolbar-btn" @click="handleBatchMove" title="移动到分组">
          📁
        </button>
        <button class="toolbar-btn danger" @click="handleBatchDelete" title="批量删除">
          🗑️
        </button>
        <button class="toolbar-btn" @click="exitSelectionMode" title="取消">
          ✕
        </button>
      </div>
    </div>

    <!-- 分组筛选（下拉）+ 新建分组 -->
    <div v-if="!selectionMode" class="group-filter">
      <select v-model="currentGroup" class="group-select" title="按分组筛选">
        <option :value="null">全部分组</option>
        <option v-for="group in groups" :key="group.name" :value="group.name">
          {{ group.name }} ({{ group.count }})
        </option>
      </select>
      <button class="filter-btn add-group" @click="openCreateGroupDialog" title="新建分组">
        ＋ 分组
      </button>
    </div>

    <div class="list-content" v-if="!loading">
      <!-- 按分组显示 -->
      <template v-if="!selectionMode">
        <div v-for="(groupConvs, groupName) in groupedConversations" :key="groupName" class="group-section">
          <div
            class="group-header"
            :class="{ 'is-ungrouped': !groupName }"
            @click="toggleGroupCollapse(groupName)"
            @contextmenu.prevent="showGroupMenu($event, groupName, groupConvs.length)"
          >
            <span class="group-name">{{ groupName || '未分组' }}</span>
            <span class="group-count">{{ groupConvs.length }}</span>
            <span class="group-toggle">{{ collapsedGroups[groupName] ? '▶' : '▼' }}</span>
          </div>
          <div v-if="!collapsedGroups[groupName]" class="group-items">
            <div
              v-for="conv in groupConvs"
              :key="conv.conversationId"
              class="conversation-item"
              :class="{ active: conv.conversationId === currentId }"
              @click="$emit('select', conv.conversationId)"
              @contextmenu.prevent="showContextMenu($event, conv)"
            >
              <div class="conv-title">{{ conv.title }}</div>
              <div class="conv-meta">
                <span class="conv-time">{{ formatTime(conv.lastActiveAt) }}</span>
                <button
                  class="more-btn"
                  @click.stop="showContextMenu($event, conv)"
                  title="更多操作"
                >
                  ⋯
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 空分组区块：新建后立即可见，支持右键管理（重命名/删除） -->
        <div v-for="gName in emptyGroupNames" :key="'empty-' + gName" class="group-section is-empty">
          <div
            class="group-header is-empty-group"
            @contextmenu.prevent="showGroupMenu($event, gName, 0)"
          >
            <span class="group-name">{{ gName }}</span>
            <span class="group-count">0</span>
            <span class="group-empty-hint">空分组 · 右键管理，移动对话时可选</span>
          </div>
        </div>
      </template>

      <!-- 批量选择模式 -->
      <template v-else>
        <div
          v-for="conv in filteredConversations"
          :key="conv.conversationId"
          class="conversation-item selectable"
          :class="{ selected: selectedIds.includes(conv.conversationId) }"
          @click="toggleSelection(conv.conversationId)"
        >
          <input
            type="checkbox"
            :checked="selectedIds.includes(conv.conversationId)"
            @click.stop
            @change="toggleSelection(conv.conversationId)"
          />
          <div class="conv-content">
            <div class="conv-title">{{ conv.title }}</div>
            <div class="conv-time">{{ formatTime(conv.lastActiveAt) }}</div>
          </div>
        </div>
      </template>

      <div v-if="filteredConversations.length === 0" class="empty-list">
        {{ searchQuery ? '没有找到匹配的对话' : '暂无对话记录' }}
      </div>
    </div>

    <div v-else class="loading-state">
      加载中...
    </div>

    <!-- 底部操作栏 -->
    <div v-if="!selectionMode" class="list-footer">
      <button class="footer-btn" @click="enterSelectionMode" :disabled="filteredConversations.length === 0">
        批量管理
      </button>
    </div>

    <!-- 对话右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <div class="menu-item" @click="handleRename">
        <span class="menu-icon">✏️</span>
        <span>重命名</span>
      </div>
      <div class="menu-item" @click="showMoveDialog">
        <span class="menu-icon">📁</span>
        <span>移动到分组</span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item danger" @click="handleDelete">
        <span class="menu-icon">🗑️</span>
        <span>删除</span>
      </div>
    </div>

    <!-- 分组右键菜单 -->
    <div
      v-if="groupMenu.visible"
      class="context-menu"
      :style="{ left: groupMenu.x + 'px', top: groupMenu.y + 'px' }"
    >
      <div class="menu-header">
        分组：{{ groupMenu.name || '未分组' }}
        <span class="menu-header-count">{{ groupMenu.count }} 个对话</span>
      </div>
      <div class="menu-item" @click="openCreateGroupDialog">
        <span class="menu-icon">➕</span>
        <span>新建分组</span>
      </div>
      <template v-if="groupMenu.name">
        <div class="menu-item" @click="openRenameGroupDialog">
          <span class="menu-icon">✏️</span>
          <span>重命名分组</span>
        </div>
        <div class="menu-divider"></div>
        <div
          class="menu-item danger"
          :class="{ disabled: groupMenu.count > 0 }"
          :title="groupMenu.count > 0 ? `分组内有 ${groupMenu.count} 个对话，请先把对话移出分组` : ''"
          @click="openDeleteGroupDialog"
        >
          <span class="menu-icon">🗑️</span>
          <span>删除分组</span>
        </div>
      </template>
    </div>

    <!-- 重命名对话框 -->
    <div v-if="renameDialog.visible" class="dialog-overlay" @click="closeRenameDialog">
      <div class="dialog" @click.stop>
        <h3>重命名对话</h3>
        <input
          v-model="renameDialog.title"
          type="text"
          placeholder="输入新标题"
          @keydown.enter="confirmRename"
          ref="renameInput"
        />
        <div class="dialog-actions">
          <button class="btn-cancel" @click="closeRenameDialog">取消</button>
          <button class="btn-confirm" @click="confirmRename">确定</button>
        </div>
      </div>
    </div>

    <!-- 新建分组对话框 -->
    <div v-if="createGroupDialog.visible" class="dialog-overlay" @click="closeCreateGroupDialog">
      <div class="dialog" @click.stop>
        <h3>新建分组</h3>
        <input
          v-model="createGroupDialog.name"
          type="text"
          placeholder="输入分组名称"
          @keydown.enter="confirmCreateGroup"
          ref="createGroupInput"
        />
        <div class="dialog-actions">
          <button class="btn-cancel" @click="closeCreateGroupDialog">取消</button>
          <button class="btn-confirm" @click="confirmCreateGroup" :disabled="!createGroupDialog.name.trim()">确定</button>
        </div>
      </div>
    </div>

    <!-- 重命名分组对话框 -->
    <div v-if="renameGroupDialog.visible" class="dialog-overlay" @click="closeRenameGroupDialog">
      <div class="dialog" @click.stop>
        <h3>重命名分组</h3>
        <p class="dialog-hint">
          分组「{{ renameGroupDialog.oldName }}」内的 {{ renameGroupDialog.count }} 个对话将同步归入新名称。
        </p>
        <input
          v-model="renameGroupDialog.newName"
          type="text"
          placeholder="输入新的分组名称"
          @keydown.enter="confirmRenameGroup"
          ref="renameGroupInput"
        />
        <div class="dialog-actions">
          <button class="btn-cancel" @click="closeRenameGroupDialog">取消</button>
          <button class="btn-confirm" @click="confirmRenameGroup" :disabled="!renameGroupDialog.newName.trim()">确定</button>
        </div>
      </div>
    </div>

    <!-- 删除分组确认对话框 -->
    <div v-if="deleteGroupDialog.visible" class="dialog-overlay" @click="closeDeleteGroupDialog">
      <div class="dialog confirm-dialog" @click.stop>
        <h3>{{ deleteGroupDialog.blocked ? '无法删除分组' : '删除分组' }}</h3>
        <p class="dialog-hint" v-if="deleteGroupDialog.blocked">
          分组「{{ deleteGroupDialog.name }}」内还有
          <strong>{{ deleteGroupDialog.count }}</strong> 个对话。<br />
          请先把这些对话移到其他分组或「未分组」，再删除该分组。
        </p>
        <p class="dialog-hint" v-else>
          确定要删除空分组「{{ deleteGroupDialog.name }}」吗？此操作不可撤销。
        </p>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="closeDeleteGroupDialog">
            {{ deleteGroupDialog.blocked ? '我知道了' : '取消' }}
          </button>
          <button
            v-if="!deleteGroupDialog.blocked"
            class="btn-danger"
            @click="confirmDeleteGroup"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>

    <!-- 删除对话确认对话框 -->
    <div v-if="deleteConvDialog.visible" class="dialog-overlay" @click="closeDeleteConvDialog">
      <div class="dialog confirm-dialog" @click.stop>
        <h3>删除对话</h3>
        <p class="dialog-hint">
          <template v-if="deleteConvDialog.multiple">
            确定要删除选中的 <strong>{{ deleteConvDialog.count }}</strong> 个对话吗？
          </template>
          <template v-else>
            确定要删除对话「<strong>{{ deleteConvDialog.title }}</strong>」吗？
          </template>
          <br />此操作不可撤销。
        </p>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="closeDeleteConvDialog">取消</button>
          <button class="btn-danger" @click="confirmDeleteConv">确认删除</button>
        </div>
      </div>
    </div>

    <!-- 移动分组对话框 -->
    <div v-if="moveDialog.visible" class="dialog-overlay" @click="closeMoveDialog">
      <div class="dialog" @click.stop>
        <h3>移动到分组</h3>
        <div class="group-list">
          <button
            class="group-option"
            :class="{ active: moveDialog.group === '' }"
            @click="moveDialog.group = ''"
          >
            未分组
          </button>
          <button
            v-for="group in groups"
            :key="group.name"
            class="group-option"
            :class="{ active: moveDialog.group === group.name }"
            @click="moveDialog.group = group.name"
          >
            {{ group.name }}
          </button>
          <div class="new-group-row">
            <input
              v-model="newGroupName"
              type="text"
              placeholder="新建分组..."
              @keydown.enter="createNewGroup"
            />
            <button @click="createNewGroup" :disabled="!newGroupName.trim()">+</button>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="closeMoveDialog">取消</button>
          <button class="btn-confirm" @click="confirmMove">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useWorkbenchStore } from '@/stores/workbench';

const router = useRouter();

const props = defineProps({
  conversations: {
    type: Array,
    required: true,
  },
  currentId: {
    type: String,
    default: null,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['select', 'create', 'delete']);
const store = useWorkbenchStore();

const searchQuery = ref('');
const currentGroup = ref(null);
const selectionMode = ref(false);
const selectedIds = ref([]);
const collapsedGroups = ref({});
const groups = ref([]);

// 右键菜单
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  conversation: null,
});

// 重命名对话框
const renameDialog = ref({
  visible: false,
  conversationId: null,
  title: '',
});
const renameInput = ref(null);

// 移动分组对话框
const moveDialog = ref({
  visible: false,
  conversationIds: [],
  group: '',
});
const newGroupName = ref('');

// 分组右键菜单
const groupMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  name: '',
  count: 0,
});

// 新建分组对话框
const createGroupDialog = ref({ visible: false, name: '' });
const createGroupInput = ref(null);

// 重命名分组对话框
const renameGroupDialog = ref({ visible: false, oldName: '', newName: '', count: 0 });
const renameGroupInput = ref(null);

// 删除分组确认对话框
const deleteGroupDialog = ref({ visible: false, name: '', count: 0, blocked: false });

// 删除对话确认对话框
const deleteConvDialog = ref({
  visible: false,
  conversationIds: [],
  title: '',
  multiple: false,
  count: 0,
});

// 过滤后的对话
const filteredConversations = computed(() => {
  let valid = props.conversations.filter(conv => conv && conv.conversationId);
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    valid = valid.filter(conv => conv.title?.toLowerCase().includes(query));
  }
  
  if (currentGroup.value) {
    valid = valid.filter(conv => conv.group === currentGroup.value);
  } else if (currentGroup.value === null && !searchQuery.value) {
    // 全部模式，不过滤
  }
  
  return valid;
});

// 按分组归类
const groupedConversations = computed(() => {
  const result = {};
  for (const conv of filteredConversations.value) {
    const groupName = conv.group || '';
    if (!result[groupName]) {
      result[groupName] = [];
    }
    result[groupName].push(conv);
  }
  return result;
});

// 空分组：分组表里存在但当前没有任何对话的分组。
// 新建分组后能立即在列表中看到（否则只能挤在顶部筛选里，体验断裂）。
const emptyGroupNames = computed(() => {
  if (searchQuery.value) return []; // 搜索时不展示空分组，避免噪音
  const visible = new Set(Object.keys(groupedConversations.value));
  if (currentGroup.value) {
    // 筛选模式：仅当前分组为空时显示它自己
    return visible.has(currentGroup.value) ? [] : [currentGroup.value];
  }
  return groups.value
    .filter(g => g.name && !visible.has(g.name))
    .map(g => g.name);
});

// 全选状态
const isAllSelected = computed(() => {
  return filteredConversations.value.length > 0 &&
    filteredConversations.value.every(conv => selectedIds.value.includes(conv.conversationId));
});

// 加载分组列表
async function loadGroups() {
  groups.value = await store.getGroups();
}

onMounted(() => {
  loadGroups();
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('click', hideGroupMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu);
  document.removeEventListener('click', hideGroupMenu);
});

function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 48 * 60 * 60 * 1000) {
    return '昨天';
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

// 分组折叠
function toggleGroupCollapse(groupName) {
  collapsedGroups.value[groupName] = !collapsedGroups.value[groupName];
}

// 右键菜单
function showContextMenu(event, conv) {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    conversation: conv,
  };
}

function hideContextMenu() {
  contextMenu.value.visible = false;
}

// ============ 分组右键菜单 ============
function showGroupMenu(event, groupName, count) {
  hideContextMenu();
  groupMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    name: groupName || '',
    count,
  };
}

function hideGroupMenu() {
  groupMenu.value.visible = false;
}

// 新建分组
function openCreateGroupDialog() {
  hideGroupMenu();
  createGroupDialog.value = { visible: true, name: '' };
  nextTick(() => createGroupInput.value?.focus());
}

function closeCreateGroupDialog() {
  createGroupDialog.value.visible = false;
  createGroupDialog.value.name = '';
}

async function confirmCreateGroup() {
  const name = createGroupDialog.value.name.trim();
  if (!name) return;
  try {
    await store.createGroup(name);
    closeCreateGroupDialog();
    await loadGroups();
    // 新建后自动聚焦到该分组，配合空分组区块让用户立即看到成果
    currentGroup.value = name;
  } catch (err) {
    alert(err?.response?.data?.error || err?.message || '新建分组失败');
  }
}

// 重命名分组
function openRenameGroupDialog() {
  const { name, count } = groupMenu.value;
  hideGroupMenu();
  renameGroupDialog.value = { visible: true, oldName: name, newName: name, count };
  nextTick(() => {
    renameGroupInput.value?.focus();
    renameGroupInput.value?.select();
  });
}

function closeRenameGroupDialog() {
  renameGroupDialog.value.visible = false;
}

async function confirmRenameGroup() {
  const { oldName, newName } = renameGroupDialog.value;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) {
    closeRenameGroupDialog();
    return;
  }
  try {
    await store.renameGroup(oldName, trimmed);
    closeRenameGroupDialog();
    await loadGroups();
  } catch (err) {
    alert(err?.response?.data?.error || err?.message || '重命名分组失败');
  }
}

// 删除分组（组内有对话则只提示、不可删）
function openDeleteGroupDialog() {
  const { name, count } = groupMenu.value;
  hideGroupMenu();
  if (count > 0) {
    deleteGroupDialog.value = { visible: true, name, count, blocked: true };
    return;
  }
  deleteGroupDialog.value = { visible: true, name, count, blocked: false };
}

function closeDeleteGroupDialog() {
  deleteGroupDialog.value.visible = false;
}

async function confirmDeleteGroup() {
  const { name, count } = deleteGroupDialog.value;
  if (count > 0) return; // 双保险：非空分组永不删除
  try {
    await store.deleteGroup(name);
    closeDeleteGroupDialog();
    await loadGroups();
  } catch (err) {
    alert(err?.response?.data?.error || err?.message || '删除分组失败');
  }
}

// 重命名
function handleRename() {
  hideContextMenu();
  const conv = contextMenu.value.conversation;
  renameDialog.value = {
    visible: true,
    conversationId: conv.conversationId,
    title: conv.title,
  };
  nextTick(() => {
    renameInput.value?.focus();
    renameInput.value?.select();
  });
}

function closeRenameDialog() {
  renameDialog.value.visible = false;
}

async function confirmRename() {
  const { conversationId, title } = renameDialog.value;
  if (!title.trim()) return;
  
  await store.renameConversation(conversationId, title.trim());
  closeRenameDialog();
  await loadGroups();
}

// 删除单个对话：弹二次确认（不用原生 confirm）
async function handleDelete() {
  hideContextMenu();
  const conv = contextMenu.value.conversation;
  deleteConvDialog.value = {
    visible: true,
    conversationIds: [conv.conversationId],
    title: conv.title,
    multiple: false,
    count: 1,
  };
}

function closeDeleteConvDialog() {
  deleteConvDialog.value.visible = false;
}

async function confirmDeleteConv() {
  const { conversationIds, multiple } = deleteConvDialog.value;
  closeDeleteConvDialog();
  try {
    if (multiple) {
      const res = await store.batchDeleteConversations(conversationIds);
      if (res?.deletedCount === 0) {
        console.warn('批量删除失败：没有成功删除任何对话');
      }
      exitSelectionMode();
    } else {
      emit('delete', conversationIds[0]);
    }
  } catch (err) {
    console.error('删除对话失败:', err);
    exitSelectionMode();
  } finally {
    await loadGroups();
  }
}

// 移动分组
function showMoveDialog() {
  hideContextMenu();
  const conv = contextMenu.value.conversation;
  moveDialog.value = {
    visible: true,
    conversationIds: [conv.conversationId],
    group: conv.group || '',
  };
  newGroupName.value = '';
}

function closeMoveDialog() {
  moveDialog.value.visible = false;
  newGroupName.value = '';
}

async function confirmMove() {
  const { conversationIds, group } = moveDialog.value;
  await store.moveToGroup(conversationIds, group || null);
  closeMoveDialog();
  await loadGroups();
}

function createNewGroup() {
  if (newGroupName.value.trim()) {
    moveDialog.value.group = newGroupName.value.trim();
    confirmMove();
  }
}

// 批量选择模式
function enterSelectionMode() {
  selectionMode.value = true;
  selectedIds.value = [];
}

function exitSelectionMode() {
  selectionMode.value = false;
  selectedIds.value = [];
}

function toggleSelection(conversationId) {
  const index = selectedIds.value.indexOf(conversationId);
  if (index >= 0) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(conversationId);
  }
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = [];
  } else {
    selectedIds.value = filteredConversations.value.map(conv => conv.conversationId);
  }
}

// 批量删除：弹二次确认
async function handleBatchDelete() {
  if (selectedIds.value.length === 0) return;
  deleteConvDialog.value = {
    visible: true,
    conversationIds: [...selectedIds.value],
    title: '',
    multiple: true,
    count: selectedIds.value.length,
  };
}

function handleBatchMove() {
  if (selectedIds.value.length === 0) return;
  moveDialog.value = {
    visible: true,
    conversationIds: [...selectedIds.value],
    group: '',
  };
  newGroupName.value = '';
}
</script>

<style scoped lang="less">
.conversation-list {
  width: 280px;
  min-width: 280px;
  background: var(--wb-surface, #ffffff);
  border-right: 1px solid var(--wb-border, #e5e7eb);
  display: flex;
  flex-direction: column;
  position: relative;
}

.list-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--wb-border-light, #f0f0f0);

  h2 {
    margin: 0 0 12px 0;
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--wb-text, #1a1a2e);

    .logo-img {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .badge {
      font-size: 10px;
      background: var(--wb-primary, #4f46e5);
      color: #fff;
      padding: 1px 6px;
      border-radius: 10px;
      font-weight: 500;
    }
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .back-btn {
    flex: 1;
    padding: 8px 12px;
    background: var(--wb-surface-alt, #f2f3f5);
    color: var(--wb-text-secondary, #6b7280);
    border: 1px solid var(--wb-border, #e5e7eb);
    border-radius: var(--wb-radius-sm, 6px);
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    font-weight: 500;
    transition: all 0.15s;

    &:hover {
      border-color: var(--wb-primary, #4f46e5);
      color: var(--wb-primary, #4f46e5);
    }
  }

  .new-chat-btn {
    flex: 1;
    padding: 8px 12px;
    background: var(--wb-primary, #4f46e5);
    color: #fff;
    border: none;
    border-radius: var(--wb-radius-sm, 6px);
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    font-weight: 500;
    transition: opacity 0.15s;

    &:hover {
      opacity: 0.88;
    }
  }
}

.search-box {
  margin: 10px 16px 6px;

  input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--wb-border, #e5e7eb);
    border-radius: var(--wb-radius-sm, 6px);
    font-size: 12px;
    background: var(--wb-surface-alt, #f2f3f5);
    outline: none;
    transition: all 0.2s;

    &:focus {
      border-color: var(--wb-primary, #4f46e5);
      background: var(--wb-surface);
    }

    &::placeholder {
      color: var(--wb-text-muted, #9ca3af);
    }
  }
}

// 批量操作工具栏
.batch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--wb-primary-light, #eef2ff);
  border-bottom: 1px solid var(--wb-border, #e5e7eb);

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 8px;

    input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .selected-count {
      font-size: 12px;
      color: var(--wb-primary, #4f46e5);
      font-weight: 500;
    }
  }

  .toolbar-right {
    display: flex;
    gap: 4px;

    .toolbar-btn {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;

      &:hover {
        background: rgba(79, 70, 229, 0.1);
      }

      &.danger:hover {
        background: rgba(239, 68, 68, 0.1);
      }
    }
  }
}

// 分组筛选（下拉 + 新建）
.group-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--wb-border, #e5e7eb);
  background: var(--wb-surface-alt, #f2f3f5);

  .group-select {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid var(--wb-border, #e5e7eb);
    border-radius: 6px;
    background: var(--wb-surface, #ffffff);
    font-size: 12px;
    font-weight: 500;
    color: var(--wb-text, #1a1a2e);
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;

    &:hover,
    &:focus {
      border-color: var(--wb-primary, #4f46e5);
    }
  }

  .filter-btn {
    padding: 5px 12px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: var(--wb-surface, #ffffff);
    font-size: 12px;
    font-weight: 500;
    color: var(--wb-text-secondary, #6b7280);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

    &:hover {
      border-color: var(--wb-primary, #4f46e5);
      color: var(--wb-primary, #4f46e5);
      background: var(--wb-primary-light, #eef2ff);
    }

    // 「＋ 分组」新建入口
    &.add-group {
      color: var(--wb-primary, #4f46e5);
      border: 1px dashed var(--wb-primary, #4f46e5);
      background: transparent;
      box-shadow: none;
      flex-shrink: 0;

      &:hover {
        border-color: var(--wb-primary, #4f46e5);
        background: var(--wb-primary-light, #eef2ff);
      }
    }
  }
}

.list-content {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
}

// 分组区域
.group-section {
  margin-bottom: 10px;

  .group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    cursor: pointer;
    user-select: none;
    border-radius: 8px;
    transition: background 0.15s;
    position: relative;

    // 左侧色条标识
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 60%;
      border-radius: 2px;
      background: var(--wb-primary, #4f46e5);
      opacity: 0.6;
      transition: opacity 0.15s;
    }

    &:hover {
      background: var(--wb-surface-alt, #f2f3f5);

      &::before {
        opacity: 1;
      }
    }

    // 「未分组」为系统兜底区：不支持重命名/删除，但可右键新建分组
    &.is-ungrouped {
      cursor: default;

      &::before {
        background: var(--wb-text-muted, #9ca3af);
      }
    }

    .group-name {
      font-size: 12px;
      font-weight: 700;
      color: var(--wb-text, #1a1a2e);
      letter-spacing: 0.3px;
      padding-left: 6px;
    }

    .group-count {
      font-size: 11px;
      font-weight: 600;
      color: var(--wb-primary, #4f46e5);
      background: var(--wb-primary-light, #eef2ff);
      padding: 2px 7px;
      border-radius: 10px;
      min-width: 20px;
      text-align: center;
    }

    .group-toggle {
      margin-left: auto;
      font-size: 9px;
      color: var(--wb-text-muted, #9ca3af);
      transition: transform 0.15s;
    }
  }

  .group-items {
    padding-left: 6px;
  }

  // 空分组区块：淡显 + 提示文案，可右键管理
  &.is-empty {
    .group-header.is-empty-group {
      cursor: default;

      &::before {
        background: var(--wb-text-muted, #9ca3af);
        opacity: 0.35;
      }

      &:hover {
        background: var(--wb-surface-alt, #f2f3f5);

        &::before {
          opacity: 0.7;
        }
      }

      .group-count {
        color: var(--wb-text-muted, #9ca3af);
        background: var(--wb-surface-alt, #f2f3f5);
      }

      .group-empty-hint {
        margin-left: auto;
        font-size: 11px;
        color: var(--wb-text-muted, #9ca3af);
        white-space: nowrap;
      }
    }
  }
}

.conversation-item {
  padding: 10px 12px;
  margin-bottom: 2px;
  border-radius: var(--wb-radius-sm, 6px);
  cursor: pointer;
  transition: background 0.12s;

  &:hover {
    background: var(--wb-surface-alt, #f2f3f5);
  }

  &.active {
    background: var(--wb-primary-light, #eef2ff);

    .conv-title {
      color: var(--wb-primary, #4f46e5);
    }
  }

  &.selectable {
    display: flex;
    align-items: center;
    gap: 10px;

    input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
      flex-shrink: 0;
    }

    &.selected {
      background: var(--wb-primary-light, #eef2ff);
    }

    .conv-content {
      flex: 1;
      min-width: 0;
    }
  }

  .conv-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--wb-text, #1a1a2e);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conv-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 3px;

    .conv-time {
      font-size: 10px;
      color: var(--wb-text-muted, #9ca3af);
    }

    .more-btn {
      width: 20px;
      height: 20px;
      border: none;
      background: transparent;
      color: var(--wb-text-muted, #9ca3af);
      font-size: 16px;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: all 0.2s;

      &:hover {
        background: var(--wb-surface-alt, #f2f3f5);
        color: var(--wb-primary, #4f46e5);
      }
    }
  }

  &:hover .more-btn {
    opacity: 1;
  }
}

.empty-list {
  padding: 40px 16px;
  text-align: center;
  color: var(--wb-text-muted, #9ca3af);
  font-size: 13px;
}

.loading-state {
  padding: 40px 16px;
  text-align: center;
  color: var(--wb-text-muted, #9ca3af);
  font-size: 13px;
}

// 底部操作栏
.list-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--wb-border-light, #f0f0f0);

  .footer-btn {
    width: 100%;
    padding: 8px;
    border: 1px solid var(--wb-border, #e5e7eb);
    border-radius: var(--wb-radius-sm, 6px);
    background: transparent;
    font-size: 12px;
    color: var(--wb-text-secondary, #6b7280);
    cursor: pointer;
    transition: all 0.15s;

    &:hover:not(:disabled) {
      border-color: var(--wb-primary, #4f46e5);
      color: var(--wb-primary, #4f46e5);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

// 右键菜单
.context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--wb-surface, #ffffff);
  border: 1px solid var(--wb-border, #e5e7eb);
  border-radius: var(--wb-radius-sm, 6px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 4px;
  min-width: 140px;

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    color: var(--wb-text, #1a1a2e);
    transition: background 0.12s;

    &:hover {
      background: var(--wb-surface-alt, #f2f3f5);
    }

    &.danger {
      color: var(--wb-danger, #ef4444);

      &:hover {
        background: var(--wb-danger-bg, #fef2f2);
      }

      // 组内有对话时禁止删除
      &.disabled {
        color: var(--wb-text-muted, #9ca3af);
        cursor: not-allowed;
        opacity: 0.55;

        &:hover {
          background: transparent;
        }
      }
    }

    .menu-icon {
      font-size: 14px;
    }
  }

  .menu-header {
    padding: 8px 12px 6px;
    font-size: 12px;
    color: var(--wb-text-secondary, #6b7280);
    border-bottom: 1px solid var(--wb-border-light, #f0f0f0);
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    .menu-header-count {
      font-size: 11px;
      background: var(--wb-surface-alt, #f2f3f5);
      padding: 1px 6px;
      border-radius: 8px;
      white-space: nowrap;
    }
  }

  .menu-divider {
    height: 1px;
    background: var(--wb-border-light, #f0f0f0);
    margin: 4px 0;
  }
}

// 对话框
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog {
  background: var(--wb-surface, #ffffff);
  border-radius: var(--wb-radius-lg, 14px);
  padding: 20px;
  min-width: 300px;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);

  h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--wb-text, #1a1a2e);
  }

  // 二次确认弹窗的说明文案
  .dialog-hint {
    margin: 0 0 14px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--wb-text-secondary, #6b7280);

    strong {
      color: var(--wb-text, #1a1a2e);
      font-weight: 600;
    }
  }

  input[type="text"] {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--wb-border, #e5e7eb);
    border-radius: var(--wb-radius-sm, 6px);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;

    &:focus {
      border-color: var(--wb-primary, #4f46e5);
    }
  }

  .group-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;

    .group-option {
      padding: 10px 12px;
      border: 1px solid var(--wb-border, #e5e7eb);
      border-radius: var(--wb-radius-sm, 6px);
      background: transparent;
      text-align: left;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--wb-primary, #4f46e5);
      }

      &.active {
        background: var(--wb-primary-light, #eef2ff);
        border-color: var(--wb-primary, #4f46e5);
        color: var(--wb-primary, #4f46e5);
      }
    }

    .new-group-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;

      input {
        flex: 1;
      }

      button {
        width: 36px;
        height: 36px;
        border: 1px solid var(--wb-border, #e5e7eb);
        border-radius: var(--wb-radius-sm, 6px);
        background: transparent;
        font-size: 18px;
        cursor: pointer;
        transition: all 0.15s;

        &:hover:not(:disabled) {
          border-color: var(--wb-primary, #4f46e5);
          color: var(--wb-primary, #4f46e5);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;

    button {
      padding: 8px 16px;
      border-radius: var(--wb-radius-sm, 6px);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-cancel {
      border: 1px solid var(--wb-border, #e5e7eb);
      background: transparent;
      color: var(--wb-text-secondary, #6b7280);

      &:hover {
        background: var(--wb-surface-alt, #f2f3f5);
      }
    }

    .btn-confirm {
      border: none;
      background: var(--wb-primary, #4f46e5);
      color: #fff;

      &:hover {
        opacity: 0.88;
      }
    }

    // 危险操作确认按钮（删除对话 / 删除分组）
    .btn-danger {
      border: none;
      background: var(--wb-danger, #ef4444);
      color: #fff;

      &:hover {
        opacity: 0.88;
      }
    }
  }
}

/* 滚动条样式 */
.list-content::-webkit-scrollbar {
  width: 5px;
}

.list-content::-webkit-scrollbar-track {
  background: transparent;
}

.list-content::-webkit-scrollbar-thumb {
  background: var(--wb-border);
  border-radius: 3px;
}

.list-content::-webkit-scrollbar-thumb:hover {
  background: var(--wb-text-muted);
}
</style>
