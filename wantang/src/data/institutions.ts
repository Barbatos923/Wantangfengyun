import type { Institution } from '@engine/official/types';

export interface InstitutionDef {
  id: Institution;
  name: string;
  parentId?: Institution;
}

const INSTITUTIONS: InstitutionDef[] = [
  { id: '中书门下', name: '中书门下' },
  { id: '翰林院', name: '翰林院' },
  { id: '枢密院', name: '枢密院' },
  { id: '神策军', name: '神策军' },
  { id: '三司', name: '三司' },
  { id: '中书省', name: '中书省' },
  { id: '门下省', name: '门下省' },
  { id: '尚书省', name: '尚书省' },
  { id: '吏部', name: '吏部', parentId: '尚书省' },
  { id: '户部', name: '户部', parentId: '尚书省' },
  { id: '礼部', name: '礼部', parentId: '尚书省' },
  { id: '兵部', name: '兵部', parentId: '尚书省' },
  { id: '刑部', name: '刑部', parentId: '尚书省' },
  { id: '工部', name: '工部', parentId: '尚书省' },
  { id: '御史台', name: '御史台' },
  { id: '秘书省', name: '秘书省' },
  { id: '三公', name: '三公' },
  { id: '皇室', name: '皇室' },
  { id: '藩镇', name: '藩镇' },
  { id: '州府', name: '州府' },
];

export const institutionMap = new Map<Institution, InstitutionDef>();
for (const inst of INSTITUTIONS) {
  institutionMap.set(inst.id, inst);
}

export function childInstitutions(parentId: Institution): InstitutionDef[] {
  return INSTITUTIONS.filter(i => i.parentId === parentId);
}
