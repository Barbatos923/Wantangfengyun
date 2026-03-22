import { create } from 'zustand';
import type { Territory, Construction, Post } from './types';
import { positionMap } from '@data/positions';

// ===== 索引构建辅助 =====

function buildIndexes(territories: Map<string, Territory>, centralPosts: Post[]) {
  const postIndex = new Map<string, Post>();
  const holderIndex = new Map<string, string[]>();

  function indexPost(post: Post) {
    postIndex.set(post.id, post);
    if (post.holderId) {
      const arr = holderIndex.get(post.holderId);
      if (arr) {
        arr.push(post.id);
      } else {
        holderIndex.set(post.holderId, [post.id]);
      }
    }
  }

  for (const t of territories.values()) {
    for (const p of t.posts) {
      indexPost(p);
    }
  }
  for (const p of centralPosts) {
    indexPost(p);
  }

  return { postIndex, holderIndex };
}

// ===== Store =====

interface TerritoryStoreState {
  territories: Map<string, Territory>;
  centralPosts: Post[];

  // 索引
  postIndex: Map<string, Post>;        // postId → Post (O(1) 查找)
  holderIndex: Map<string, string[]>;   // holderId → postId[] (O(1) 查找)

  // 初始化
  initTerritories: (terrs: Territory[]) => void;
  initCentralPosts: (posts: Post[]) => void;

  // 查询
  getTerritory: (id: string) => Territory | undefined;
  getTerritoriesByController: (controllerId: string) => Territory[];
  getAllZhou: () => Territory[];

  // 岗位查询（索引加速）
  findPost: (postId: string) => Post | undefined;
  getPostsByHolder: (holderId: string) => Post[];
  getActualController: (territoryId: string) => string | null;

  // 修改
  updateTerritory: (id: string, patch: Partial<Territory>) => void;
  updatePost: (postId: string, patch: Partial<Post>) => void;
  startConstruction: (territoryId: string, construction: Construction) => void;
  advanceConstructions: (territoryId: string) => void;
}

export const useTerritoryStore = create<TerritoryStoreState>((set, get) => ({
  territories: new Map(),
  centralPosts: [],
  postIndex: new Map(),
  holderIndex: new Map(),

  initTerritories: (terrs) => {
    const map = new Map<string, Territory>();
    for (const t of terrs) {
      map.set(t.id, t);
    }
    const indexes = buildIndexes(map, get().centralPosts);
    set({ territories: map, ...indexes });
  },

  initCentralPosts: (posts) => {
    const indexes = buildIndexes(get().territories, posts);
    set({ centralPosts: posts, ...indexes });
  },

  getTerritory: (id) => get().territories.get(id),

  getTerritoriesByController: (controllerId) => {
    const result: Territory[] = [];
    get().territories.forEach((t) => {
      const mainPost = t.posts.find(p => {
        const tpl = positionMap.get(p.templateId);
        return tpl?.grantsControl === true;
      });
      if (mainPost?.holderId === controllerId) result.push(t);
    });
    return result;
  },

  getAllZhou: () => {
    const result: Territory[] = [];
    get().territories.forEach((t) => {
      if (t.tier === 'zhou') result.push(t);
    });
    return result;
  },

  // O(1) 查找
  findPost: (postId) => get().postIndex.get(postId),

  // O(k) 查找（k = 持有岗位数）
  getPostsByHolder: (holderId) => {
    const postIds = get().holderIndex.get(holderId);
    if (!postIds) return [];
    const { postIndex } = get();
    return postIds.map(id => postIndex.get(id)!).filter(Boolean);
  },

  getActualController: (territoryId) => {
    const t = get().territories.get(territoryId);
    if (!t) return null;
    const mainPost = t.posts.find(p => {
      const tpl = positionMap.get(p.templateId);
      return tpl?.grantsControl === true;
    });
    return mainPost?.holderId ?? null;
  },

  updateTerritory: (id, patch) => {
    set((state) => {
      const terrs = new Map(state.territories);
      const existing = terrs.get(id);
      if (!existing) return state;
      terrs.set(id, { ...existing, ...patch });
      return { territories: terrs };
    });
  },

  // 更新岗位 + 增量更新索引
  updatePost: (postId, patch) => {
    set((state) => {
      const oldPost = state.postIndex.get(postId);
      if (!oldPost) return state;

      const newPost = { ...oldPost, ...patch };

      // 更新 postIndex
      const newPostIndex = new Map(state.postIndex);
      newPostIndex.set(postId, newPost);

      // 更新 holderIndex（如果 holderId 变了）
      let newHolderIndex = state.holderIndex;
      if (patch.holderId !== undefined && patch.holderId !== oldPost.holderId) {
        newHolderIndex = new Map(state.holderIndex);
        // 从旧 holder 移除
        if (oldPost.holderId) {
          const oldArr = newHolderIndex.get(oldPost.holderId);
          if (oldArr) {
            const filtered = oldArr.filter(id => id !== postId);
            if (filtered.length > 0) {
              newHolderIndex.set(oldPost.holderId, filtered);
            } else {
              newHolderIndex.delete(oldPost.holderId);
            }
          }
        }
        // 添加到新 holder
        if (newPost.holderId) {
          const newArr = newHolderIndex.get(newPost.holderId);
          if (newArr) {
            newHolderIndex.set(newPost.holderId, [...newArr, postId]);
          } else {
            newHolderIndex.set(newPost.holderId, [postId]);
          }
        }
      }

      // 更新实际存储（centralPosts 或 territory.posts）
      const centralIdx = state.centralPosts.findIndex(p => p.id === postId);
      if (centralIdx !== -1) {
        const newCentralPosts = [...state.centralPosts];
        newCentralPosts[centralIdx] = newPost;
        return { centralPosts: newCentralPosts, postIndex: newPostIndex, holderIndex: newHolderIndex };
      }

      const terrs = new Map(state.territories);
      for (const [tid, t] of terrs) {
        const postIdx = t.posts.findIndex(p => p.id === postId);
        if (postIdx !== -1) {
          const newPosts = [...t.posts];
          newPosts[postIdx] = newPost;
          terrs.set(tid, { ...t, posts: newPosts });
          return { territories: terrs, postIndex: newPostIndex, holderIndex: newHolderIndex };
        }
      }

      return state;
    });
  },

  startConstruction: (territoryId, construction) => {
    set((state) => {
      const terrs = new Map(state.territories);
      const t = terrs.get(territoryId);
      if (!t) return state;
      terrs.set(territoryId, {
        ...t,
        constructions: [...t.constructions, construction],
      });
      return { territories: terrs };
    });
  },

  advanceConstructions: (territoryId) => {
    set((state) => {
      const terrs = new Map(state.territories);
      const t = terrs.get(territoryId);
      if (!t) return state;

      const remaining: Construction[] = [];
      const buildings = [...t.buildings];

      for (const c of t.constructions) {
        const newRemaining = c.remainingMonths - 1;
        if (newRemaining <= 0) {
          buildings[c.slotIndex] = {
            buildingId: c.buildingId,
            level: c.targetLevel,
          };
        } else {
          remaining.push({ ...c, remainingMonths: newRemaining });
        }
      }

      terrs.set(territoryId, { ...t, buildings, constructions: remaining });
      return { territories: terrs };
    });
  },
}));
