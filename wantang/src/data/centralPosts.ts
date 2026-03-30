// ===== 中央岗位数据（867年）=====
// 数据存储在 centralPosts.json

import type { Post } from '@engine/territory/types';
import centralPostsData from './centralPosts.json';

export function createCentralPosts(): Post[] {
  return centralPostsData as Post[];
}
