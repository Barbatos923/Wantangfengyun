import { create } from 'zustand';
import type { Territory, Construction, Post } from './types';
import { positionMap } from '@data/positions';
import { getHeldPosts } from '@engine/official/postQueries';
import { getBaseLegitimacy, getHighestBaseLegitimacy } from '@engine/official/legitimacyCalc';
import {
  APPOINT_RIGHT_OPINION,
  CLAN_SUCCESSION_OPINION,
  MILITARY_TYPE_OPINION,
} from '@engine/interaction/centralizationAction';

/** 岗位相关政策好感缓存条目（辟署权/继承法/职类） */
export interface PolicyOpinionEntry {
  appointRight: number;  // 辟署权好感
  succession: number;    // 继承法好感
  type: number;          // 职类好感
}

// ===== 索引构建辅助 =====

function buildIndexes(territories: Map<string, Territory>, centralPosts: Post[]) {
  const postIndex = new Map<string, Post>();
  const holderIndex = new Map<string, string[]>();
  const controllerIndex = new Map<string, Set<string>>();

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
      if (
        positionMap.get(p.templateId)?.grantsControl === true &&
        p.holderId &&
        p.territoryId
      ) {
        const set = controllerIndex.get(p.holderId);
        if (set) {
          set.add(p.territoryId);
        } else {
          controllerIndex.set(p.holderId, new Set([p.territoryId]));
        }
      }
    }
  }
  for (const p of centralPosts) {
    indexPost(p);
  }

  return { postIndex, holderIndex, controllerIndex };
}

// ===== Store =====

interface TerritoryStoreState {
  territories: Map<string, Territory>;
  centralPosts: Post[];

  // 索引
  postIndex: Map<string, Post>;              // postId → Post (O(1) 查找)
  holderIndex: Map<string, string[]>;        // holderId → postId[] (O(1) 查找)
  controllerIndex: Map<string, Set<string>>; // controllerId → Set<territoryId>
  expectedLegitimacy: Map<string, number>;   // charId → 最高岗位 baseLegitimacy
  policyOpinionCache: Map<string, PolicyOpinionEntry>; // charId → 岗位相关政策好感

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

  // 正统性预期缓存
  refreshExpectedLegitimacy: () => void;
  updateExpectedLegitimacy: (charId: string) => void;

  // 政策好感缓存（辟署权/继承法/职类）
  refreshPolicyOpinionCache: () => void;
  updateCharPolicyCache: (charId: string) => void;

  // 修改
  updateTerritory: (id: string, patch: Partial<Territory>) => void;
  updatePost: (postId: string, patch: Partial<Post>) => void;
  addPost: (territoryId: string, post: Post) => void;
  removePost: (postId: string) => void;
  startConstruction: (territoryId: string, construction: Construction) => void;
  advanceConstructions: (territoryId: string) => void;
}

export const useTerritoryStore = create<TerritoryStoreState>((set, get) => ({
  territories: new Map(),
  centralPosts: [],
  postIndex: new Map(),
  holderIndex: new Map(),
  controllerIndex: new Map(),
  expectedLegitimacy: new Map(),
  policyOpinionCache: new Map(),

  initTerritories: (terrs) => {
    const map = new Map<string, Territory>();
    for (const t of terrs) {
      map.set(t.id, t);
    }
    const indexes = buildIndexes(map, get().centralPosts);
    set({ territories: map, ...indexes });
    get().refreshExpectedLegitimacy();
    get().refreshPolicyOpinionCache();
  },

  initCentralPosts: (posts) => {
    const indexes = buildIndexes(get().territories, posts);
    set({ centralPosts: posts, ...indexes });
    get().refreshExpectedLegitimacy();
    get().refreshPolicyOpinionCache();
  },

  getTerritory: (id) => get().territories.get(id),

  getTerritoriesByController: (controllerId) => {
    const { controllerIndex, territories } = get();
    const terrIds = controllerIndex.get(controllerId);
    if (!terrIds) return [];
    const result: Territory[] = [];
    for (const tid of terrIds) {
      const t = territories.get(tid);
      if (t) result.push(t);
    }
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

  // 全量重建 expectedLegitimacy 缓存（单次遍历）
  refreshExpectedLegitimacy: () => {
    const { territories, centralPosts } = get();
    const map = new Map<string, number>();
    function processPost(p: Post) {
      if (!p.holderId) return;
      const base = getBaseLegitimacy(p.templateId);
      const existing = map.get(p.holderId);
      if (existing === undefined || base > existing) {
        map.set(p.holderId, base);
      }
    }
    for (const t of territories.values()) {
      for (const p of t.posts) processPost(p);
    }
    for (const p of centralPosts) processPost(p);
    set({ expectedLegitimacy: map });
  },

  // 单个角色更新（任命/罢免时用）
  updateExpectedLegitimacy: (charId) => {
    const { territories, centralPosts, expectedLegitimacy } = get();
    const posts = getHeldPosts(charId, territories, centralPosts);
    const highest = getHighestBaseLegitimacy(posts);
    const newMap = new Map(expectedLegitimacy);
    if (highest !== null) {
      newMap.set(charId, highest);
    } else {
      newMap.delete(charId);
    }
    set({ expectedLegitimacy: newMap });
  },

  // 全量重建政策好感缓存（岗位遍历，取每角色最高值）
  refreshPolicyOpinionCache: () => {
    const { territories } = get();
    const cache = new Map<string, PolicyOpinionEntry>();

    for (const terr of territories.values()) {
      for (const post of terr.posts) {
        if (!post.holderId) continue;
        const tpl = positionMap.get(post.templateId);
        if (!tpl?.grantsControl) continue;
        const tier = terr.tier;

        const existing = cache.get(post.holderId) ?? { appointRight: 0, succession: 0, type: 0 };

        if (post.hasAppointRight) {
          existing.appointRight = Math.max(existing.appointRight, APPOINT_RIGHT_OPINION[tier] ?? 0);
        }
        if (post.successionLaw === 'clan') {
          existing.succession = Math.max(existing.succession, CLAN_SUCCESSION_OPINION[tier] ?? 0);
        }
        if (tpl.territoryType === 'military') {
          existing.type = Math.max(existing.type, MILITARY_TYPE_OPINION);
        }

        cache.set(post.holderId, existing);
      }
    }
    set({ policyOpinionCache: cache });
  },

  // 单角色增量更新政策好感缓存（O(K)，K=角色持有岗位数）
  updateCharPolicyCache: (charId) => {
    const { territories, holderIndex, policyOpinionCache } = get();
    const newCache = new Map(policyOpinionCache);
    const postIds = holderIndex.get(charId);

    if (!postIds || postIds.length === 0) {
      if (newCache.has(charId)) {
        newCache.delete(charId);
        set({ policyOpinionCache: newCache });
      }
      return;
    }

    let appointRight = 0;
    let succession = 0;
    let type = 0;

    for (const pid of postIds) {
      const post = get().postIndex.get(pid);
      if (!post?.territoryId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      const terr = territories.get(post.territoryId);
      if (!terr) continue;
      const tier = terr.tier;

      if (post.hasAppointRight) {
        appointRight = Math.max(appointRight, APPOINT_RIGHT_OPINION[tier] ?? 0);
      }
      if (post.successionLaw === 'clan') {
        succession = Math.max(succession, CLAN_SUCCESSION_OPINION[tier] ?? 0);
      }
      if (tpl.territoryType === 'military') {
        type = Math.max(type, MILITARY_TYPE_OPINION);
      }
    }

    if (appointRight === 0 && succession === 0 && type === 0) {
      newCache.delete(charId);
    } else {
      newCache.set(charId, { appointRight, succession, type });
    }
    set({ policyOpinionCache: newCache });
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
    const oldPost = get().postIndex.get(postId);
    if (!oldPost) return;

    // 判断是否需要刷新政策好感缓存
    const needsPolicyCacheRefresh =
      (patch.holderId !== undefined && patch.holderId !== oldPost.holderId) ||
      (patch.hasAppointRight !== undefined && patch.hasAppointRight !== oldPost.hasAppointRight) ||
      (patch.successionLaw !== undefined && patch.successionLaw !== oldPost.successionLaw) ||
      (patch.templateId !== undefined && patch.templateId !== oldPost.templateId);

    set((state) => {
      const oldPost = state.postIndex.get(postId);
      if (!oldPost) return state;

      const newPost = { ...oldPost, ...patch };

      // DEBUG: 岗位持有人变动监测
      if (patch.holderId !== undefined && patch.holderId !== oldPost.holderId) {
        const tpl = positionMap.get(oldPost.templateId);
        const terrName = oldPost.territoryId ? state.territories.get(oldPost.territoryId)?.name : '中央';
        const postName = tpl?.name ?? oldPost.templateId;
        // 延迟获取角色名（避免循环依赖）
        const getCharName = (id: string | null) => {
          if (!id) return '空缺';
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useCharacterStore } = require('@engine/character/CharacterStore');
            return useCharacterStore.getState().getCharacter(id)?.name ?? id;
          } catch { return id; }
        };
        const fromName = getCharName(oldPost.holderId);
        const toName = getCharName(patch.holderId);
        const reason = patch.appointedBy === 'succession' ? '继承'
          : patch.appointedBy === 'escheat' ? '绝嗣上交'
          : patch.appointedBy ? `由${getCharName(patch.appointedBy)}任命`
          : '未知';
        console.log(`[岗位变动] ${terrName} ${postName}: ${fromName} → ${toName} (${reason})`);
      }

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

      // 更新 controllerIndex（如果 holderId 变了，且是授权控制岗位，且有 territoryId）
      let newControllerIndex = state.controllerIndex;
      if (
        patch.holderId !== undefined &&
        patch.holderId !== oldPost.holderId &&
        positionMap.get(oldPost.templateId)?.grantsControl === true &&
        oldPost.territoryId
      ) {
        newControllerIndex = new Map(state.controllerIndex);
        // 从旧 holder 移除
        if (oldPost.holderId) {
          const oldSet = newControllerIndex.get(oldPost.holderId);
          if (oldSet) {
            const newSet = new Set(oldSet);
            newSet.delete(oldPost.territoryId);
            if (newSet.size > 0) {
              newControllerIndex.set(oldPost.holderId, newSet);
            } else {
              newControllerIndex.delete(oldPost.holderId);
            }
          }
        }
        // 添加到新 holder
        if (newPost.holderId) {
          const existingSet = newControllerIndex.get(newPost.holderId);
          if (existingSet) {
            const newSet = new Set(existingSet);
            newSet.add(oldPost.territoryId);
            newControllerIndex.set(newPost.holderId, newSet);
          } else {
            newControllerIndex.set(newPost.holderId, new Set([oldPost.territoryId]));
          }
        }
      }

      // 更新实际存储（centralPosts 或 territory.posts）
      const centralIdx = state.centralPosts.findIndex(p => p.id === postId);
      if (centralIdx !== -1) {
        const newCentralPosts = [...state.centralPosts];
        newCentralPosts[centralIdx] = newPost;
        return { centralPosts: newCentralPosts, postIndex: newPostIndex, holderIndex: newHolderIndex, controllerIndex: newControllerIndex };
      }

      const terrs = new Map(state.territories);
      for (const [tid, t] of terrs) {
        const postIdx = t.posts.findIndex(p => p.id === postId);
        if (postIdx !== -1) {
          const newPosts = [...t.posts];
          newPosts[postIdx] = newPost;
          terrs.set(tid, { ...t, posts: newPosts });
          return { territories: terrs, postIndex: newPostIndex, holderIndex: newHolderIndex, controllerIndex: newControllerIndex };
        }
      }

      return state;
    });

    // 政策好感缓存增量更新（set 之后，索引已更新）
    if (needsPolicyCacheRefresh && positionMap.get(oldPost.templateId)?.grantsControl) {
      if (patch.holderId !== undefined && patch.holderId !== oldPost.holderId) {
        // holderId 变更：刷新新旧两个角色
        if (oldPost.holderId) get().updateCharPolicyCache(oldPost.holderId);
        if (patch.holderId) get().updateCharPolicyCache(patch.holderId);
      } else {
        // 属性变更（hasAppointRight/successionLaw/templateId）：刷新当前持有人
        const currentHolder = get().postIndex.get(postId)?.holderId;
        if (currentHolder) get().updateCharPolicyCache(currentHolder);
      }
    }
  },

  // 向领地添加新岗位 + 增量更新索引
  addPost: (territoryId, post) => {
    set((state) => {
      const t = state.territories.get(territoryId);
      if (!t) return state;

      // 更新领地
      const terrs = new Map(state.territories);
      terrs.set(territoryId, { ...t, posts: [...t.posts, post] });

      // 更新 postIndex
      const newPostIndex = new Map(state.postIndex);
      newPostIndex.set(post.id, post);

      // 更新 holderIndex
      let newHolderIndex = state.holderIndex;
      if (post.holderId) {
        newHolderIndex = new Map(state.holderIndex);
        const arr = newHolderIndex.get(post.holderId);
        if (arr) {
          newHolderIndex.set(post.holderId, [...arr, post.id]);
        } else {
          newHolderIndex.set(post.holderId, [post.id]);
        }
      }

      // 更新 controllerIndex
      let newControllerIndex = state.controllerIndex;
      if (
        positionMap.get(post.templateId)?.grantsControl === true &&
        post.holderId &&
        post.territoryId
      ) {
        newControllerIndex = new Map(state.controllerIndex);
        const existingSet = newControllerIndex.get(post.holderId);
        if (existingSet) {
          const newSet = new Set(existingSet);
          newSet.add(post.territoryId);
          newControllerIndex.set(post.holderId, newSet);
        } else {
          newControllerIndex.set(post.holderId, new Set([post.territoryId]));
        }
      }

      return { territories: terrs, postIndex: newPostIndex, holderIndex: newHolderIndex, controllerIndex: newControllerIndex };
    });

    // 新岗位有持有人且 grantsControl → 刷新持有人缓存
    if (post.holderId && positionMap.get(post.templateId)?.grantsControl) {
      get().updateCharPolicyCache(post.holderId);
    }
  },

  // 从领地移除岗位 + 增量清理索引
  removePost: (postId) => {
    const removedPost = get().postIndex.get(postId);

    set((state) => {
      const oldPost = state.postIndex.get(postId);
      if (!oldPost) return state;

      // 更新 postIndex
      const newPostIndex = new Map(state.postIndex);
      newPostIndex.delete(postId);

      // 更新 holderIndex
      let newHolderIndex = state.holderIndex;
      if (oldPost.holderId) {
        newHolderIndex = new Map(state.holderIndex);
        const arr = newHolderIndex.get(oldPost.holderId);
        if (arr) {
          const filtered = arr.filter(id => id !== postId);
          if (filtered.length > 0) {
            newHolderIndex.set(oldPost.holderId, filtered);
          } else {
            newHolderIndex.delete(oldPost.holderId);
          }
        }
      }

      // 更新 controllerIndex
      let newControllerIndex = state.controllerIndex;
      if (
        positionMap.get(oldPost.templateId)?.grantsControl === true &&
        oldPost.holderId &&
        oldPost.territoryId
      ) {
        newControllerIndex = new Map(state.controllerIndex);
        const oldSet = newControllerIndex.get(oldPost.holderId);
        if (oldSet) {
          const newSet = new Set(oldSet);
          newSet.delete(oldPost.territoryId);
          if (newSet.size > 0) {
            newControllerIndex.set(oldPost.holderId, newSet);
          } else {
            newControllerIndex.delete(oldPost.holderId);
          }
        }
      }

      // 从领地的 posts 数组中移除
      const terrs = new Map(state.territories);
      for (const [tid, t] of terrs) {
        const idx = t.posts.findIndex(p => p.id === postId);
        if (idx !== -1) {
          terrs.set(tid, { ...t, posts: t.posts.filter(p => p.id !== postId) });
          return { territories: terrs, postIndex: newPostIndex, holderIndex: newHolderIndex, controllerIndex: newControllerIndex };
        }
      }

      // fallback: 从 centralPosts 中移除
      const centralIdx = state.centralPosts.findIndex(p => p.id === postId);
      if (centralIdx !== -1) {
        return {
          centralPosts: state.centralPosts.filter(p => p.id !== postId),
          postIndex: newPostIndex, holderIndex: newHolderIndex, controllerIndex: newControllerIndex,
        };
      }

      return { postIndex: newPostIndex, holderIndex: newHolderIndex, controllerIndex: newControllerIndex };
    });

    // 岗位移除后刷新旧持有人的政策好感缓存
    if (removedPost?.holderId && positionMap.get(removedPost.templateId)?.grantsControl) {
      get().updateCharPolicyCache(removedPost.holderId);
    }
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
