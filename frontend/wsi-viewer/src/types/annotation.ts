export interface AnnotationBody {
  type: string;
  value: string;
  purpose: string;
}

export interface AnnotationTarget {
  selector: Record<string, unknown>;
}

export interface Annotation {
  id: string;
  type: string;
  body: AnnotationBody | AnnotationBody[];
  target: AnnotationTarget;
  created: string;
  modified: string;
  revision: number;
}

export interface AnnotationCreate {
  body: AnnotationBody | AnnotationBody[];
  target: AnnotationTarget;
}

export interface AnnotationUpdate {
  body?: AnnotationBody | AnnotationBody[];
  target?: AnnotationTarget;
  revision?: number;
}

export interface AnnotationMutation extends AnnotationUpdate {
  action: "create" | "update" | "delete";
  annotation_id?: string;
}

export interface AnnotationBatchResponse {
  created: Annotation[];
  updated: Annotation[];
  deleted: string[];
}
