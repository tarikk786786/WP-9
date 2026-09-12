/**
 * Context Graph Entities
 * Defines typed entities: person, company, place, project, event, preference
 */

export type EntityType =
  | 'person'
  | 'company'
  | 'place'
  | 'project'
  | 'event'
  | 'preference'
  | 'device'
  | 'product';

export interface GraphEntity {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
