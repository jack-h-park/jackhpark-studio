export type Mode = 'quick' | 'guide' | 'explore';
export const sectionIds = ['overview','inputs','knowledge','writing','questions','learning','decisions','roles','limits'] as const;
export type SectionId = typeof sectionIds[number];
export type InputId = 'external-signals' | 'hands-on-projects' | 'market-study';
export type UseId = 'strategic-viewpoints' | 'pm-questions' | 'new-opportunities' | 'product-decisions';
export type EvidenceStatus = 'observed' | 'documented-purpose' | 'illustrative' | 'aspiration';
export type RecordId = 'strategy-note' | 'answer-draft' | 'demand' | 'study-note' | 'practice-response';
export type DecisionChoice = 'proceed' | 'revise' | 'verify' | 'hold';
export interface KnowledgeRecord { id: RecordId; title: string; observation: string; interpretation: string; uncertainty: string; status: EvidenceStatus; observedOn?: string; sourceUrl?: string }
export interface WorldContent {
 purpose: string;
 sections: Array<{id:SectionId; title:string; eyebrow:string; summary:string}>;
 inputs: Array<{id:InputId; title:string; description:string}>;
 uses: Array<{id:UseId; title:string; description:string; section:SectionId}>;
 relations: Array<{from:InputId; to:UseId; status:EvidenceStatus; explanation:string}>;
 records: KnowledgeRecord[];
 roles: Array<{name:string; role:string; prepares:string}>;
 decisionExample: {title:string; status:'illustrative'; evidence:string[]; uncertainty:string; nextReview:string};
 limits: string[];
 links: {deck:string; project:string; contact:string};
}
